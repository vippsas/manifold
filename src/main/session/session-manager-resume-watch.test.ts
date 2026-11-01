import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../git/managed-worktree', () => ({ prepareManagedWorktree: vi.fn(async () => {}) }))
vi.mock('../git/worktree-meta', () => ({
  readWorktreeMeta: vi.fn(),
  writeWorktreeMeta: vi.fn(async () => {}),
}))
vi.mock('../git/git-exec', () => ({ gitExec: vi.fn(async () => 'feature') }))
vi.mock('../agent/agent-env', () => ({ agentSpawnEnv: () => undefined }))
vi.mock('../agent/runtimes', () => ({
  getRuntimeById: (id: string) => ({ id, binary: 'offline-agent', args: [] }),
}))

import { SessionManager } from './session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { readWorktreeMeta } from '../git/worktree-meta'
import type { PtyPool } from '../agent/pty-pool'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ProjectRegistry } from '../store/project-registry'
import { createMockWindow } from './session-manager.test-helpers'

class FakePtyPool {
  launches: { id: string; binary: string; args: string[] }[] = []
  exits = new Map<string, (code: number) => void>()
  spawn(binary: string, args: string[]) {
    const id = `pty-${this.launches.length + 1}`
    this.launches.push({ id, binary, args })
    return { id, pid: this.launches.length }
  }
  onData() {}
  onExit(id: string, listener: (code: number) => void) { this.exits.set(id, listener) }
  kill(id: string) { this.exits.delete(id) }
}

describe('SessionManager — dormant checkout activation', () => {
  let watcher: FileWatcher
  let manager: SessionManager
  let ptyPool: FakePtyPool
  let window: ReturnType<typeof createMockWindow>
  let statuses: Map<string, string>
  let branch: string
  let gitStatusFn: ReturnType<typeof vi.fn<(cwd: string) => Promise<string>>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    statuses = new Map()
    branch = 'feature'
    gitStatusFn = vi.fn(async (cwd: string) => statuses.get(cwd) ?? '')
    watcher = new FileWatcher(gitStatusFn, undefined, undefined, async () => branch)
    ptyPool = new FakePtyPool()
    const project = { id: 'project', path: '/repo', name: 'repo', baseBranch: 'main' }
    manager = new SessionManager(
      { listWorktrees: async () => [{ path: '/checkout', branch: 'feature' }] } as unknown as WorktreeManager,
      ptyPool as unknown as PtyPool,
      { getProject: () => project } as unknown as ProjectRegistry,
      undefined,
      watcher,
    )
    window = createMockWindow()
    manager.setMainWindow(window)
    watcher.setMainWindow(window)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    vi.useRealTimers()
  })

  async function discover(nonInteractive: boolean) {
    vi.mocked(readWorktreeMeta).mockResolvedValue({
      sessionId: 'restored', runtimeId: 'codex', codexThreadId: 'thread',
      additionalDirs: ['/extra/one', '/extra/two'], nonInteractive,
    })
    await manager.discoverSessionsForProject('project')
    gitStatusFn.mockClear()
  }

  for (const nonInteractive of [false, true]) {
    it(`watches the entire checkout on ${nonInteractive ? 'chat' : 'interactive'} resume`, async () => {
      await discover(nonInteractive)
      const watch = vi.spyOn(watcher, 'watch')
      const watchAdditionalDir = vi.spyOn(watcher, 'watchAdditionalDir')

      const resumed = await manager.resumeSession('restored', 'codex')

      expect(resumed.id).toBe('restored')
      expect(watch).toHaveBeenCalledWith('/checkout', 'restored')
      expect(watchAdditionalDir.mock.calls).toEqual([
        ['/extra/one', 'restored'], ['/extra/two', 'restored'],
      ])
      expect(ptyPool.launches).toHaveLength(nonInteractive ? 0 : 1)
      if (!nonInteractive) {
        expect(ptyPool.launches[0].args).toEqual(expect.arrayContaining([
          '--add-dir', '/extra/one', '--add-dir', '/extra/two',
        ]))
      }

      statuses.set('/checkout', '?? new.txt\n')
      statuses.set('/extra/one', '?? extra.txt\n')
      branch = 'renamed'
      await vi.advanceTimersByTimeAsync(2_000)

      await vi.waitFor(() => {
        expect(manager.getSession('restored')?.branchName).toBe('renamed')
        expect(window.webContents.send).toHaveBeenCalledWith('files:changed', expect.objectContaining({
          sessionId: 'restored', changes: [{ path: 'new.txt', type: 'added' }],
        }))
        expect(window.webContents.send).toHaveBeenCalledWith('files:changed', expect.objectContaining({
          sessionId: 'restored', source: '/extra/one',
        }))
      })
    })

    it(`does not duplicate poll entries on repeated ${nonInteractive ? 'chat' : 'interactive'} resume`, async () => {
      await discover(nonInteractive)
      await Promise.all([
        manager.resumeSession('restored', 'codex'),
        manager.resumeSession('restored', 'codex'),
      ])
      await manager.resumeSession('restored', 'codex')
      await vi.advanceTimersByTimeAsync(0)
      gitStatusFn.mockClear()

      await vi.advanceTimersByTimeAsync(10_000)

      for (const dir of ['/checkout', '/extra/one', '/extra/two']) {
        expect(gitStatusFn.mock.calls.filter(([cwd]) => cwd === dir)).toHaveLength(5)
      }
      expect(ptyPool.launches).toHaveLength(nonInteractive ? 0 : 1)
    })
  }

  it('watches a dormant chat checkout when a message arrives without an explicit resume', async () => {
    await discover(true)
    const watch = vi.spyOn(watcher, 'watch')
    const watchAdditionalDir = vi.spyOn(watcher, 'watchAdditionalDir')

    manager.sendInput('restored', 'Update the files')

    expect(ptyPool.launches).toHaveLength(1)
    expect(watch).toHaveBeenCalledWith('/checkout', 'restored')
    expect(watchAdditionalDir.mock.calls).toEqual([
      ['/extra/one', 'restored'], ['/extra/two', 'restored'],
    ])

    statuses.set('/extra/one', '?? updated.txt\n')
    branch = 'chat-branch'
    await vi.advanceTimersByTimeAsync(2_000)

    await vi.waitFor(() => {
      expect(manager.getSession('restored')?.branchName).toBe('chat-branch')
      expect(window.webContents.send).toHaveBeenCalledWith('files:changed', expect.objectContaining({
        sessionId: 'restored', source: '/extra/one',
        changes: [{ path: 'updated.txt', type: 'added' }],
      }))
    })
  })

  for (const teardown of ['kill', 'retire'] as const) {
    it(`keeps a sibling's worktree and additional-dir polls running on ${teardown}`, async () => {
      await discover(true)
      await manager.resumeSession('restored', 'codex')
      const sibling = await manager.createSession({
        projectId: 'project', runtimeId: 'codex', prompt: '', nonInteractive: true,
        existingWorktreePath: '/checkout', additionalDirs: ['/extra/one', '/extra/two'],
      })

      if (teardown === 'kill') {
        await manager.killSession('restored')
      } else {
        await manager.configureSession('restored', {
          displayName: 'Replacement', runtimeId: 'codex', viewMode: 'terminal',
        })
      }
      await vi.advanceTimersByTimeAsync(0)
      gitStatusFn.mockClear()
      vi.mocked(window.webContents.send).mockClear()
      statuses.set('/extra/one', '?? survivor.txt\n')

      await vi.advanceTimersByTimeAsync(2_000)

      expect(manager.getSession(sibling.id)).toBeDefined()
      expect(gitStatusFn).toHaveBeenCalledWith('/checkout')
      expect(gitStatusFn).toHaveBeenCalledWith('/extra/one')
      expect(gitStatusFn).toHaveBeenCalledWith('/extra/two')
      await vi.waitFor(() => {
        expect(window.webContents.send).toHaveBeenCalledWith('files:changed', expect.objectContaining({
          sessionId: sibling.id, source: '/extra/one',
        }))
      })
    })
  }
})
