import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue(''),
}))

vi.mock('../git/managed-worktree', () => ({
  getManagedWorktreeStatus: vi.fn().mockResolvedValue(''),
  commitManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../git/worktree-meta', () => ({
  removeWorktreeMeta: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../app/debug-log', () => ({
  debugLog: vi.fn(),
}))

import { SessionTeardown } from './session-teardown'
import { gitExec } from '../git/git-exec'
import type { InternalSession } from './session-types'
import type { PtyPool } from '../agent/pty-pool'
import type { ProjectRegistry } from '../store/project-registry'

function makeSession(overrides: Partial<InternalSession>): InternalSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/repo/.manifold/worktrees/manifold-oslo',
    status: 'running',
    pid: 123,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    ...overrides,
  } as InternalSession
}

function makeMocks(sessions: Map<string, InternalSession>) {
  const ptyPool = { kill: vi.fn() } as unknown as PtyPool
  const projectRegistry = {
    getProject: vi.fn(() => ({ id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '' })),
  } as unknown as ProjectRegistry
  const onKillSession = vi.fn().mockResolvedValue(undefined)
  return {
    teardown: new SessionTeardown(sessions, ptyPool, projectRegistry, onKillSession),
    ptyPool,
    onKillSession,
  }
}

describe('SessionTeardown.killNonInteractiveSessions', () => {
  beforeEach(() => {
    vi.mocked(gitExec).mockClear()
    vi.mocked(gitExec).mockResolvedValue('')
  })

  it('skips onKillSession when a session is removed mid-loop and continues to the next session', async () => {
    const a = makeSession({ id: 'sess-a', nonInteractive: true })
    const b = makeSession({ id: 'sess-b', nonInteractive: true, ptyId: '' })
    const sessions = new Map<string, InternalSession>([[a.id, a], [b.id, b]])
    const { teardown, onKillSession } = makeMocks(sessions)

    // Simulate concurrent removal of sess-a between when toKill is built and when
    // onKillSession is reached for it (e.g. it was killed via agent:kill concurrently).
    // We do this by removing it after the snapshot is taken but before onKillSession runs.
    const { getManagedWorktreeStatus } = await import('../git/managed-worktree')
    let callCount = 0
    vi.mocked(getManagedWorktreeStatus).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // Remove sess-a from the live map during first iteration (simulates concurrent kill)
        sessions.delete('sess-a')
      }
      return ''
    })

    const result = await teardown.killNonInteractiveSessions('proj-1')

    // sess-a was removed from the map before onKillSession reached it
    expect(onKillSession).not.toHaveBeenCalledWith('sess-a')
    // sess-b was still present so it should have been killed
    expect(onKillSession).toHaveBeenCalledWith('sess-b')
    // Both IDs are reported as killed (loop didn't abort)
    expect(result.killedIds).toContain('sess-a')
    expect(result.killedIds).toContain('sess-b')
  })
})

describe('SessionTeardown.killInteractiveSession', () => {
  beforeEach(() => {
    vi.mocked(gitExec).mockClear()
    vi.mocked(gitExec).mockResolvedValue('')
  })

  // Switching modes replaces the agent, not the place it works: the checkout
  // belongs to the workspace, which is still there afterwards.
  it('leaves the checkout in place, even as the last agent working in it', async () => {
    const sess = makeSession({ id: 'sess-1' })
    const sessions = new Map([[sess.id, sess]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-1')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).not.toContainEqual(['worktree', 'remove', sess.worktreePath, '--force'])
  })
})
