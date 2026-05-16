import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

vi.mock('node:child_process', () => ({
  default: { execFile: vi.fn() },
  execFile: vi.fn(),
}))

vi.mock('./managed-worktree', () => ({
  commitManagedWorktree: vi.fn(),
  getManagedWorktreeStatus: vi.fn(),
  stageManagedWorktreePath: vi.fn(),
}))

import { GitOperationsManager } from './git-operations'

describe('GitOperationsManager.isBranchMerged', () => {
  let git: GitOperationsManager

  beforeEach(() => {
    git = new GitOperationsManager()
    mockExecFileAsync.mockReset()
  })

  it('returns true when merge-base --is-ancestor exits successfully', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' })
    const merged = await git.isBranchMerged('/tmp/wt', 'main', 'manifold/foo')
    expect(merged).toBe(true)
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'git',
      ['merge-base', '--is-ancestor', 'manifold/foo', 'main'],
      { cwd: '/tmp/wt' },
    )
  })

  it('returns false when merge-base --is-ancestor exits non-zero', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('not an ancestor'))
    const merged = await git.isBranchMerged('/tmp/wt', 'main', 'manifold/foo')
    expect(merged).toBe(false)
  })
})
