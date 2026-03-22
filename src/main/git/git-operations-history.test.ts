import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecFileAsync = vi.hoisted(() => vi.fn())

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

vi.mock('node:child_process', () => ({
  default: { execFile: vi.fn(), spawn: vi.fn() },
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  default: { writeFile: vi.fn() },
}))

vi.mock('./managed-worktree', () => ({
  commitManagedWorktree: vi.fn(),
  getManagedWorktreeStatus: vi.fn(),
  stageManagedWorktreePath: vi.fn(),
}))

import { GitOperationsManager } from './git-operations'

describe('GitOperationsManager history', () => {
  let git: GitOperationsManager

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitOperationsManager()
  })

  describe('getPRContext', () => {
    it('returns commits, diffStat, and truncated diffPatch', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234 feat: add login\ndef5678 fix: typo\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: ' src/a.ts | 10 ++++\n src/b.ts |  3 ---\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'diff --git a/src/a.ts b/src/a.ts\n+new line\n', stderr: '' })

      const ctx = await git.getPRContext('/worktree', 'main')

      expect(ctx.commits).toBe('abc1234 feat: add login\ndef5678 fix: typo')
      expect(ctx.diffStat).toBe('src/a.ts | 10 ++++\n src/b.ts |  3 ---')
      expect(ctx.diffPatch).toBe('diff --git a/src/a.ts b/src/a.ts\n+new line')
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git', ['log', '--oneline', 'main..HEAD'], { cwd: '/worktree' },
      )
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git', ['diff', '--stat', 'main..HEAD'], { cwd: '/worktree' },
      )
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git', ['diff', 'main..HEAD'], { cwd: '/worktree' },
      )
    })

    it('truncates diffPatch to 6000 chars', async () => {
      const longPatch = 'x'.repeat(8000)
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc feat\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'stat\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: longPatch, stderr: '' })

      const ctx = await git.getPRContext('/worktree', 'main')

      expect(ctx.diffPatch.length).toBe(6000)
    })

    it('returns empty strings on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not a git repo'))

      const ctx = await git.getPRContext('/worktree', 'main')

      expect(ctx).toEqual({ commits: '', diffStat: '', diffPatch: '' })
    })
  })

  describe('fetchAndUpdate', () => {
    it('uses merge --ff-only when base branch is checked out', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'def5678\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '3\n', stderr: '' })

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result).toEqual({
        updatedBranch: 'main',
        previousRef: 'abc1234',
        currentRef: 'def5678',
        commitCount: 3,
      })
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        3, 'git', ['symbolic-ref', '--short', 'HEAD'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        4, 'git', ['merge', '--ff-only', 'origin/main'], { cwd: '/project' },
      )
    })

    it('uses fetch origin branch:branch when base branch is not checked out', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'develop\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'def5678\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '3\n', stderr: '' })

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result).toEqual({
        updatedBranch: 'main',
        previousRef: 'abc1234',
        currentRef: 'def5678',
        commitCount: 3,
      })
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        4, 'git', ['fetch', 'origin', 'main:main'], { cwd: '/project' },
      )
    })

    it('falls back to fetch origin branch:branch on detached HEAD', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockRejectedValueOnce(new Error('not a symbolic ref'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0\n', stderr: '' })

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result.commitCount).toBe(0)
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        4, 'git', ['fetch', 'origin', 'main:main'], { cwd: '/project' },
      )
    })

    it('returns commitCount 0 when already up to date', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0\n', stderr: '' })

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result.commitCount).toBe(0)
      expect(result.previousRef).toBe('abc1234')
      expect(result.currentRef).toBe('abc1234')
    })

    it('propagates error when fetch fails', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockRejectedValueOnce(new Error('Could not resolve host'))

      await expect(git.fetchAndUpdate('/project', 'main'))
        .rejects.toThrow('Could not resolve host')
    })

    it('propagates error when fast-forward fails (diverged)', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
        .mockRejectedValueOnce(new Error('non-fast-forward'))

      await expect(git.fetchAndUpdate('/project', 'main'))
        .rejects.toThrow('non-fast-forward')
    })
  })
})
