import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../git/managed-worktree', () => ({
  prepareManagedWorktree: vi.fn(async () => {}),
}))

vi.mock('../git/worktree-meta', () => ({
  readWorktreeMeta: vi.fn(),
}))

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn(async () => ''),
}))

import { SessionDiscovery } from './session-discovery'
import { SessionManager } from './session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { readWorktreeMeta } from '../git/worktree-meta'
import { gitExec } from '../git/git-exec'
import type { BrowserWindow } from 'electron'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ProjectRegistry } from '../store/project-registry'
import type { InternalSession } from './session-types'
import type { PtyPool } from '../agent/pty-pool'
import type { WorktreeMeta } from '../git/worktree-meta'

function deps(meta: Record<string, unknown> | null) {
  vi.mocked(readWorktreeMeta).mockResolvedValue(meta as never)
  const sessions = new Map<string, InternalSession>()
  const worktreeManager = {
    listWorktrees: vi.fn(async () => [{ branch: 'manifold/foo', path: '/wt' }]),
  } as unknown as WorktreeManager
  const projectRegistry = {
    getProject: vi.fn(() => ({
      id: 'p1', name: 'm', path: '/repo', baseBranch: 'main', kind: 'git',
    })),
  } as unknown as ProjectRegistry
  const discovery = new SessionDiscovery(sessions, worktreeManager, projectRegistry)
  return { discovery, sessions, worktreeManager, projectRegistry }
}

describe('SessionDiscovery session-id stability', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores the persisted session id on re-adoption instead of minting a fresh one', async () => {
    const { discovery, sessions } = deps({ runtimeId: 'codex', sessionId: 'persisted-sid', codexThreadId: 'thread-1' })

    await discovery.discoverSessionsForProject('p1')

    const session = Array.from(sessions.values())[0]
    expect(session.id).toBe('persisted-sid')
    expect(session.codexThreadId).toBe('thread-1')
  })

  it('mints a fresh id when meta has no persisted session id', async () => {
    const { discovery, sessions } = deps({ runtimeId: 'claude' })

    await discovery.discoverSessionsForProject('p1')

    const session = Array.from(sessions.values())[0]
    expect(session.id).toBeTruthy()
    expect(session.id).not.toBe('persisted-sid')
  })

  it('migrates the rejected Conductor profile metadata to the Viola runtime', async () => {
    const { discovery, sessions } = deps({ runtimeId: 'claude', conductor: true, displayName: 'Conductor' })

    await discovery.discoverSessionsForProject('p1')

    expect(Array.from(sessions.values())[0]).toMatchObject({
      runtimeId: 'viola',
      nonInteractive: true,
      displayName: 'Viola',
    })
  })

  it('migrates the temporary Conductor runtime id to Viola', async () => {
    const { discovery, sessions } = deps({ runtimeId: 'conductor' })

    await discovery.discoverSessionsForProject('p1')

    expect(Array.from(sessions.values())[0]).toMatchObject({
      runtimeId: 'viola',
      nonInteractive: true,
    })
  })
})

describe('SessionDiscovery orchestrated workers', () => {
  it('restores the orchestrating session from worktree meta', async () => {
    const { discovery, sessions } = deps({ runtimeId: 'claude', nonInteractive: true, orchestratedBy: 'viola-1' })

    await discovery.discoverSessionsForProject('p1')

    expect(Array.from(sessions.values())[0].orchestratedBy).toBe('viola-1')
  })
})

describe('SessionDiscovery dormant checkout polling', () => {
  it('restores metadata for several dormant sessions without starting any Git polls', async () => {
    vi.useFakeTimers()
    const gitStatusFn = vi.fn(async () => '')
    const watcher = new FileWatcher(gitStatusFn, undefined, undefined, async () => 'main')
    const watch = vi.spyOn(watcher, 'watch')
    const watchAdditionalDir = vi.spyOn(watcher, 'watchAdditionalDir')
    try {
      const { worktreeManager, projectRegistry } = deps(null)
      const worktrees = Array.from({ length: 5 }, (_, i) => ({ path: `/wt/${i}`, branch: `feature/${i}` }))
      const metadata = new Map<string, WorktreeMeta>(worktrees.map(({ path }, i) => [path, {
        sessionId: `persisted-${i}`,
        runtimeId: 'codex',
        displayName: `Agent ${i}`,
        taskDescription: `Task ${i}`,
        simpleTemplateTitle: 'Template',
        simplePromptInstructions: 'Instructions',
        additionalDirs: [`/additional/${i}`, '/shared'],
        ollamaModel: 'local-model',
        workspaceId: 'workspace-1',
        workspaceWorktreePaths: { primary: path, additional: `/additional/${i}` },
        nonInteractive: i % 2 === 0,
        orchestratedBy: 'parent-session',
        codexThreadId: `thread-${i}`,
        locked: true,
      }]))
      vi.mocked(worktreeManager.listWorktrees).mockResolvedValue(worktrees)
      vi.mocked(readWorktreeMeta).mockImplementation(async (path) => metadata.get(path) ?? null)
      const manager = new SessionManager(worktreeManager, {} as PtyPool, projectRegistry, undefined, watcher)

      const restored = await manager.discoverSessionsForProject('p1')

      expect(restored).toHaveLength(worktrees.length)
      for (const { path, branch } of worktrees) {
        const { sessionId, ...persisted } = metadata.get(path)!
        expect(manager.getInternalSession(sessionId!)).toMatchObject({
          ...persisted, id: sessionId, projectId: 'p1', worktreePath: path,
          branchName: branch, status: 'done', pid: null, ptyId: '', outputBuffer: '',
        })
      }
      expect(watch).not.toHaveBeenCalled()
      expect(watchAdditionalDir).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(gitStatusFn).not.toHaveBeenCalled()
    } finally {
      await watcher.unwatchAll()
      vi.useRealTimers()
    }
  })
})

describe('SessionDiscovery renderer readiness', () => {
  it.each(['worktree', 'in-place', 'simple-project'])(
    'signals the registered %s session once without waiting for file activity',
    async (route) => {
      vi.clearAllMocks()
      const { worktreeManager, projectRegistry } = deps({ sessionId: 'restored', runtimeId: 'claude' })
      const project = projectRegistry.getProject('p1')!
      projectRegistry.listProjects = () => [project]
      if (route !== 'worktree') vi.mocked(worktreeManager.listWorktrees).mockResolvedValue([])
      vi.mocked(gitExec).mockResolvedValue(route === 'in-place' ? 'feature' : 'main')
      const manager = new SessionManager(worktreeManager, {} as PtyPool, projectRegistry)
      const send = vi.fn((channel: string, event: { sessionId: string }) => {
        // The renderer can immediately retry a read from inside the event.
        expect(channel).toBe('files:tree-changed')
        expect(manager.getSession(event.sessionId)).toBeDefined()
      })
      manager.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
      const discover = () => route === 'simple-project'
        ? manager.discoverAllSessions('/repo')
        : manager.discoverSessionsForProject('p1')

      const sessions = await discover()

      expect(sessions).toHaveLength(1)
      expect(send).toHaveBeenCalledExactlyOnceWith('files:tree-changed', {
        sessionId: 'restored', rootPath: route === 'worktree' ? '/wt' : '/repo',
      })
      await discover()
      expect(send).toHaveBeenCalledTimes(1)
    },
  )
})
