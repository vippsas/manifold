import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `session-uuid-${++uuidCounter}`),
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn((id: string) => {
    if (id === 'claude') {
      return { id: 'claude', name: 'Claude Code', binary: 'claude', args: ['--allow-dangerously-skip-permissions'], env: undefined }
    }
    return undefined
  }),
}))

vi.mock('../agent/status-detector', () => ({
  detectStatus: vi.fn(() => 'running'),
}))

vi.mock('../fs/add-dir-detector', () => ({
  detectAddDir: vi.fn(() => null),
}))

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue('main\n'),
}))

vi.mock('../git/managed-worktree', () => ({
  prepareManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

import { SessionManager } from './session-manager'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { gitExec } from '../git/git-exec'
import {
  createMockWorktreeManager,
  createMockPtyPool,
  createMockProjectRegistry,
} from './session-manager.test-helpers'

describe('SessionManager — dismissed agents (#679)', () => {
  let worktreeManager: ReturnType<typeof createMockWorktreeManager>
  let ptyPool: ReturnType<typeof createMockPtyPool>
  let projectRegistry: ReturnType<typeof createMockProjectRegistry>
  let sessionManager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    uuidCounter = 0
    worktreeManager = createMockWorktreeManager()
    ptyPool = createMockPtyPool()
    projectRegistry = createMockProjectRegistry()
    sessionManager = new SessionManager(
      worktreeManager as unknown as WorktreeManager,
      ptyPool as unknown as PtyPool,
      projectRegistry as unknown as ProjectRegistry,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not resurrect a dismissed branch as a dormant noWorktree session', async () => {
    ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(gitExec as ReturnType<typeof vi.fn>).mockResolvedValue('feature-x\n')
    const dismissed = { has: vi.fn(() => true), delete: vi.fn() }
    sessionManager.setDismissedAgents(dismissed)

    const sessions = await sessionManager.discoverSessionsForProject('proj-1')

    expect(sessions).toEqual([])
    expect(dismissed.has).toHaveBeenCalledWith('proj-1', 'feature-x')
  })

  it('still synthesizes a dormant session when the branch is not dismissed', async () => {
    ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(gitExec as ReturnType<typeof vi.fn>).mockResolvedValue('feature-x\n')
    const dismissed = { has: vi.fn(() => false), delete: vi.fn() }
    sessionManager.setDismissedAgents(dismissed)

    const sessions = await sessionManager.discoverSessionsForProject('proj-1')

    expect(sessions).toHaveLength(1)
    expect(sessions[0].branchName).toBe('feature-x')
  })

  it('creating a session clears the dismissal for its branch', async () => {
    const dismissed = { has: vi.fn(() => false), delete: vi.fn() }
    sessionManager.setDismissedAgents(dismissed)

    const session = await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'test',
    })

    expect(dismissed.delete).toHaveBeenCalledWith('proj-1', session.branchName)
  })
})
