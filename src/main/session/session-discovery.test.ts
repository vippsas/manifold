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
import { readWorktreeMeta } from '../git/worktree-meta'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ProjectRegistry } from '../store/project-registry'
import type { InternalSession } from './session-types'

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
  const discovery = new SessionDiscovery(sessions, worktreeManager, projectRegistry, undefined)
  return { discovery, sessions }
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
