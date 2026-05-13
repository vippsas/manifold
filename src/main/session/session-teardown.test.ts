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

describe('SessionTeardown.killInteractiveSession', () => {
  beforeEach(() => {
    vi.mocked(gitExec).mockClear()
    vi.mocked(gitExec).mockResolvedValue('')
  })

  it('removes the worktree when no other sessions share it', async () => {
    const sess = makeSession({ id: 'sess-1' })
    const sessions = new Map([[sess.id, sess]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-1')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).toContainEqual(['worktree', 'remove', sess.worktreePath, '--force'])
  })

  it('keeps the worktree when another live session shares the path', async () => {
    const a = makeSession({ id: 'sess-a', ptyId: 'pty-a' })
    const b = makeSession({ id: 'sess-b', ptyId: 'pty-b', runtimeId: 'codex' })
    const sessions = new Map([[a.id, a], [b.id, b]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-a')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).not.toContainEqual(['worktree', 'remove', a.worktreePath, '--force'])
  })

  it('removes the worktree when the only other session on the path has already exited', async () => {
    const a = makeSession({ id: 'sess-a' })
    const dead = makeSession({ id: 'sess-dead', pid: null, ptyId: '' })
    const sessions = new Map([[a.id, a], [dead.id, dead]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-a')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).toContainEqual(['worktree', 'remove', a.worktreePath, '--force'])
  })
})
