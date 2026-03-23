import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gitExec: vi.fn(),
  prepareManagedWorktree: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  mkdirSync: mocks.mkdirSync,
  existsSync: mocks.existsSync,
}))

vi.mock('./git-exec', () => ({
  gitExec: mocks.gitExec,
}))

vi.mock('./managed-worktree', () => ({
  prepareManagedWorktree: mocks.prepareManagedWorktree,
}))

describe('BranchCheckoutManager reuse', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.existsSync.mockReturnValue(true)
  })

  it('reuses an existing worktree when the branch is already checked out in one', async () => {
    mocks.gitExec
      .mockResolvedValueOnce([
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /Users/me/.manifold/worktrees/clock/clock-task-1',
        'branch refs/heads/clock/task-1',
        '',
      ].join('\n'))
      .mockResolvedValueOnce('')

    const { BranchCheckoutManager } = await import('./branch-checkout-manager')
    const manager = new BranchCheckoutManager('/Users/me/.manifold')

    const result = await manager.createWorktreeFromBranch('/repo', 'clock/task-1', 'clock', 'main')

    expect(result).toEqual({
      branch: 'clock/task-1',
      path: '/Users/me/.manifold/worktrees/clock/clock-task-1',
    })
    expect(mocks.gitExec).toHaveBeenCalledWith(['worktree', 'list', '--porcelain'], '/repo')
    expect(mocks.gitExec).toHaveBeenCalledWith(['reset', '--mixed', 'HEAD'], '/Users/me/.manifold/worktrees/clock/clock-task-1')
    expect(mocks.gitExec).not.toHaveBeenCalledWith(
      ['worktree', 'add', '/Users/me/.manifold/worktrees/clock/clock-task-1', 'clock/task-1'],
      '/repo',
    )
    expect(mocks.prepareManagedWorktree).toHaveBeenCalledWith('/Users/me/.manifold/worktrees/clock/clock-task-1')
  })
})
