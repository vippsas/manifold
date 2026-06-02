import { describe, it, expect, vi } from 'vitest'
import { SessionKiller } from './session-killer'
import type { InternalSession } from './session-types'

function makeSession(over: Partial<InternalSession> = {}): InternalSession {
  return {
    id: 's1', projectId: 'api', runtimeId: 'claude', branchName: 'manifold/x',
    worktreePath: '/repo/api/.wt/x', status: 'running', pid: 1, ptyId: 'pty1',
    outputBuffer: '', additionalDirs: ['/repo/web/.wt/x', '/folder/docs'],
    workspaceId: 'w1',
    workspaceWorktreePaths: { api: '/repo/api/.wt/x', web: '/repo/web/.wt/x', docs: '/folder/docs' },
    ...over,
  } as InternalSession
}

function makeKiller(session: InternalSession) {
  const removeWorktree = vi.fn(async () => undefined)
  const projectPaths: Record<string, string> = { api: '/repo/api', web: '/repo/web', docs: '/folder/docs' }
  const killer = new SessionKiller({
    sessions: new Map([[session.id, session]]),
    ptyPool: { kill: vi.fn() } as never,
    worktreeManager: { removeWorktree } as never,
    projectRegistry: { getProject: (id: string) => ({ path: projectPaths[id] }) } as never,
    getFileWatcher: () => undefined,
    getMemoryCapture: () => null,
    getChatAdapter: () => null,
    notifySessionsChanged: vi.fn(),
  })
  return { killer, removeWorktree }
}

describe('SessionKiller — workspace agents', () => {
  it('removes every git worktree in the set and skips non-git passthrough', async () => {
    const session = makeSession()
    const { killer, removeWorktree } = makeKiller(session)
    await killer.killSession('s1')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/web', '/repo/web/.wt/x')
    expect(removeWorktree).not.toHaveBeenCalledWith('/folder/docs', '/folder/docs')
    expect(removeWorktree).toHaveBeenCalledTimes(2)
  })

  it('killAllSessionsOnWorktree removes the full set for a workspace agent', async () => {
    const session = makeSession()
    const { killer, removeWorktree } = makeKiller(session)
    await killer.killAllSessionsOnWorktree('/repo/api/.wt/x')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/web', '/repo/web/.wt/x')
    expect(removeWorktree).not.toHaveBeenCalledWith('/folder/docs', '/folder/docs')
    expect(removeWorktree).toHaveBeenCalledTimes(2)
  })
})
