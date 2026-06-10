import { describe, it, expect, vi } from 'vitest'
import { DevServerManager } from './dev-server-manager'
import { SessionKiller } from '../session/session-killer'
import type { InternalSession } from '../session/session-types'

function makeSession(over: Partial<InternalSession> = {}): InternalSession {
  return {
    id: 'old', projectId: 'p1', runtimeId: 'claude', branchName: 'main',
    worktreePath: '/p1', status: 'waiting', pid: null, ptyId: '',
    outputBuffer: '', additionalDirs: ['/p1/extra'], noWorktree: true,
    ...over,
  } as InternalSession
}

describe('DevServerManager — session eviction', () => {
  it('routes eviction through SessionKiller so capture/verdict/watch state is released', async () => {
    const evicted = makeSession()
    const sessions = new Map<string, InternalSession>([[evicted.id, evicted]])

    const memoryCapture = { stopCapturing: vi.fn() }
    const fileWatcher = { unwatchAdditionalDir: vi.fn() }
    const chatAdapter = {
      addSystemMessage: vi.fn(),
      clearSession: vi.fn(),
      getMessages: vi.fn(() => []),
    }
    const verdictRecorder = { onSessionTerminated: vi.fn(async () => undefined) }

    const killer = new SessionKiller({
      sessions,
      ptyPool: { kill: vi.fn() } as never,
      worktreeManager: { removeWorktree: vi.fn() } as never,
      projectRegistry: { getProject: () => ({ path: '/p1' }) } as never,
      getFileWatcher: () => fileWatcher as never,
      getMemoryCapture: () => memoryCapture as never,
      getChatAdapter: () => chatAdapter as never,
      notifySessionsChanged: vi.fn(),
    })
    killer.setVerdictRecorder(verdictRecorder as never)

    const ptyPool = {
      spawn: vi.fn(() => ({ id: 'pty-new', pid: 1 })),
      onData: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn(),
    }
    const projectRegistry = {
      getProject: () => ({ id: 'p1', kind: 'folder', path: '/p1', slashCommands: ['/x'] }),
    }

    const manager = new DevServerManager(
      ptyPool as never,
      () => chatAdapter as never,
      sessions,
      projectRegistry as never,
      vi.fn(),
      {} as never,
      (id) => killer.killSession(id),
    )

    await manager.startDevServerSession('p1', 'main')

    // Every per-session resource the ad-hoc deletion used to leak is now released.
    expect(memoryCapture.stopCapturing).toHaveBeenCalledWith('old')
    expect(verdictRecorder.onSessionTerminated).toHaveBeenCalledWith('old')
    expect(fileWatcher.unwatchAdditionalDir).toHaveBeenCalledWith('/p1/extra', 'old')

    // Old session gone, fresh one created for the same project.
    expect(sessions.has('old')).toBe(false)
    expect([...sessions.values()].some((s) => s.projectId === 'p1')).toBe(true)
  })

  it('only evicts sessions belonging to the opened project', async () => {
    const mine = makeSession({ id: 'mine', projectId: 'p1' })
    const other = makeSession({ id: 'other', projectId: 'p2' })
    const sessions = new Map<string, InternalSession>([
      [mine.id, mine],
      [other.id, other],
    ])

    const killSession = vi.fn(async (id: string) => { sessions.delete(id) })

    const ptyPool = {
      spawn: vi.fn(() => ({ id: 'pty-new', pid: 1 })),
      onData: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn(),
    }
    const chatAdapter = { addSystemMessage: vi.fn() }
    const projectRegistry = {
      getProject: () => ({ id: 'p1', kind: 'folder', path: '/p1', slashCommands: ['/x'] }),
    }

    const manager = new DevServerManager(
      ptyPool as never,
      () => chatAdapter as never,
      sessions,
      projectRegistry as never,
      vi.fn(),
      {} as never,
      killSession,
    )

    await manager.startDevServerSession('p1', 'main')

    expect(killSession).toHaveBeenCalledWith('mine')
    expect(killSession).not.toHaveBeenCalledWith('other')
    expect(sessions.has('other')).toBe(true)
  })
})
