import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../agent/agent-env', () => ({ agentSpawnEnv: () => undefined }))
vi.mock('../agent/runtimes', () => ({
  getRuntimeById: (id: string) => ({ id, binary: 'claude', args: [] }),
}))
vi.mock('../git/worktree-meta', () => ({ readWorktreeMeta: vi.fn(async () => null) }))
vi.mock('../git/managed-worktree', () => ({ prepareManagedWorktree: vi.fn(async () => {}) }))
vi.mock('./transcript-usage-reader', () => ({
  claudeProjectsDir: () => '/offline/claude',
  locateClaudeTranscript: vi.fn(async () => null),
}))

import { SessionManager } from './session-manager'
import { readWorktreeMeta } from '../git/worktree-meta'
import { prepareManagedWorktree } from '../git/managed-worktree'
import { locateClaudeTranscript } from './transcript-usage-reader'
import type { InternalSession } from './session-types'
import type { PtyPool } from '../agent/pty-pool'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryInjector } from '../memory/memory-injector'
import { createMockProjectRegistry, createMockWorktreeManager } from './session-manager.test-helpers'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function dormantSession(): InternalSession {
  return {
    id: 'restored', projectId: 'proj-1', runtimeId: 'claude', branchName: 'feature',
    worktreePath: '/offline/checkout', status: 'done', pid: null, ptyId: '',
    outputBuffer: '', additionalDirs: [],
  }
}

class FakePtyPool {
  launches: string[] = []
  outputs = new Map<string, (data: string) => void>()
  exits = new Map<string, (code: number) => void>()
  spawn() {
    const id = `pty-${this.launches.length + 1}`
    this.launches.push(id)
    return { id, pid: this.launches.length }
  }
  onData(id: string, listener: (data: string) => void) { this.outputs.set(id, listener) }
  onExit(id: string, listener: (code: number) => void) { this.exits.set(id, listener) }
  kill(id: string) { this.outputs.delete(id); this.exits.delete(id) }
}

class TestSessionManager extends SessionManager {
  notifySessionsChanged = vi.fn<(projectId: string) => void>()
  trackSession(session: InternalSession) { this.sessions.set(session.id, session) }
  retireSession(id: string) { this.killer.retireSession(id) }
  hasPendingResume(id: string): boolean {
    return (Reflect.get(this.lifecycle, 'resumeInFlight') as Map<string, unknown>).has(id)
  }
}

describe('SessionManager — removal during interactive resume', () => {
  let manager: TestSessionManager
  let ptyPool: FakePtyPool
  let session: InternalSession
  let injectContext: ReturnType<typeof vi.fn<MemoryInjector['injectContext']>>
  let startCapturing: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(readWorktreeMeta).mockResolvedValue(null)
    vi.mocked(prepareManagedWorktree).mockResolvedValue(undefined)
    vi.mocked(locateClaudeTranscript).mockResolvedValue(null)
    ptyPool = new FakePtyPool()
    manager = new TestSessionManager(
      createMockWorktreeManager(), ptyPool as unknown as PtyPool, createMockProjectRegistry(),
    )
    session = dormantSession()
    manager.trackSession(session)
    injectContext = vi.fn<MemoryInjector['injectContext']>().mockResolvedValue(undefined)
    manager.setMemoryInjector({ injectContext } as unknown as MemoryInjector)
    startCapturing = vi.fn()
    manager.setMemoryCapture({ startCapturing, stopCapturing: vi.fn() } as unknown as MemoryCapture)
  })

  for (const removal of ['kill', 'retire', 'replace'] as const) {
    it.each(['metadata', 'worktree', 'memory', 'transcript', 'worktree failure'] as const)(
      `aborts when ${removal} happens during %s`, async (checkpoint) => {
        const entered = deferred()
        const release = deferred()
        const wait = async () => { entered.resolve(); await release.promise }
        if (checkpoint === 'metadata') {
          vi.mocked(readWorktreeMeta).mockImplementationOnce(async () => { await wait(); return null })
        } else if (checkpoint === 'worktree' || checkpoint === 'worktree failure') {
          vi.mocked(prepareManagedWorktree).mockImplementationOnce(async () => {
            await wait()
            if (checkpoint === 'worktree failure') throw new Error('offline guard refresh failed')
          })
        } else if (checkpoint === 'memory') {
          injectContext.mockImplementationOnce(wait)
        } else {
          vi.mocked(locateClaudeTranscript).mockImplementationOnce(async () => { await wait(); return null })
        }
        const spawn = vi.spyOn(ptyPool, 'spawn')
        const resume = manager.resumeSession(session.id, 'claude')
        await entered.promise

        if (removal === 'kill') await manager.killSession(session.id)
        else manager.retireSession(session.id)
        const replacement = dormantSession()
        if (removal === 'replace') manager.trackSession(replacement)
        manager.notifySessionsChanged.mockClear()
        release.resolve()

        await expect(resume).resolves.toMatchObject({ id: session.id, status: 'done', pid: null })
        expect(spawn).not.toHaveBeenCalled()
        expect(ptyPool.outputs.size).toBe(0)
        expect(ptyPool.exits.size).toBe(0)
        expect(session.ptyId).toBe('')
        expect(startCapturing).not.toHaveBeenCalled()
        expect(manager.notifySessionsChanged).not.toHaveBeenCalled()
        expect(manager.hasPendingResume(session.id)).toBe(false)
        if (checkpoint === 'metadata') expect(prepareManagedWorktree).not.toHaveBeenCalled()
        if (checkpoint === 'metadata' || checkpoint.startsWith('worktree')) {
          expect(injectContext).not.toHaveBeenCalled()
        }
        if (checkpoint !== 'transcript') expect(locateClaudeTranscript).not.toHaveBeenCalled()
        if (removal === 'replace') {
          expect(manager.getSession(session.id)).toMatchObject({ id: replacement.id, status: 'done' })
          expect(replacement.ptyId).toBe('')
        } else {
          expect(manager.getSession(session.id)).toBeUndefined()
        }
      },
    )
  }

  it('allows a rediscovered session with the same id to resume after cancellation settles', async () => {
    const entered = deferred()
    const release = deferred()
    injectContext.mockImplementationOnce(async () => { entered.resolve(); await release.promise })
    const resume = manager.resumeSession(session.id, 'claude')
    await entered.promise
    await manager.killSession(session.id)
    release.resolve()
    await resume

    manager.trackSession(dormantSession())
    manager.notifySessionsChanged.mockClear()
    await expect(manager.resumeSession(session.id, 'claude')).resolves.toMatchObject({ status: 'running' })

    expect(ptyPool.launches).toHaveLength(1)
    expect(ptyPool.outputs.size).toBe(1)
    expect(ptyPool.exits.size).toBe(1)
    expect(startCapturing).toHaveBeenCalledExactlyOnceWith(session.id)
    expect(manager.notifySessionsChanged).toHaveBeenCalledExactlyOnceWith(session.projectId)
    expect(manager.hasPendingResume(session.id)).toBe(false)
  })
})
