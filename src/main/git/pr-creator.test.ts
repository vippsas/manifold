import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}))

// Mock promisify to return our mock function instead of promisifying execFile
vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

import { PrCreator } from './pr-creator'

describe('PrCreator', () => {
  let creator: PrCreator

  beforeEach(() => {
    vi.clearAllMocks()
    creator = new PrCreator()
  })

  describe('isGhAvailable', () => {
    it('returns true when gh --version succeeds', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'gh version 2.40.0', stderr: '' })

      const result = await creator.isGhAvailable()
      expect(result).toBe(true)
      expect(mockExecFileAsync).toHaveBeenCalledWith('gh', ['--version'])
    })

    it('returns false when gh is not installed', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('command not found'))

      const result = await creator.isGhAvailable()
      expect(result).toBe(false)
    })
  })

  describe('pushBranch', () => {
    it('executes git push with branch name', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await creator.pushBranch('/worktree', 'manifold/oslo')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', 'manifold/oslo'],
        { cwd: '/worktree' },
      )
    })

    it('propagates errors from git push', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('push rejected'))

      await expect(creator.pushBranch('/worktree', 'manifold/oslo')).rejects.toThrow(
        'push rejected',
      )
    })
  })

  describe('createPR', () => {
    it('pushes branch and creates PR via gh CLI', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'gh version 2.40.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/org/repo/pull/42\n', stderr: '' })

      const url = await creator.createPR('/worktree', 'manifold/oslo', {
        title: 'My PR',
        body: 'Description',
        baseBranch: 'main',
      })

      expect(url).toBe('https://github.com/org/repo/pull/42')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'gh',
        [
          'pr', 'create',
          '--title', 'My PR',
          '--body', 'Description',
          '--base', 'main',
          '--head', 'manifold/oslo',
        ],
        { cwd: '/worktree' },
      )
    })

    it('uses default title and body when not provided', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'gh version 2.40.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/org/repo/pull/1\n', stderr: '' })

      await creator.createPR('/worktree', 'manifold/oslo', {
        baseBranch: 'main',
      })

      const ghCallArgs = mockExecFileAsync.mock.calls[2][1] as string[]
      expect(ghCallArgs).toContain('Manifold: manifold/oslo')
    })

    it('throws if gh is not available', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'))

      await expect(
        creator.createPR('/worktree', 'manifold/oslo', { baseBranch: 'main' }),
      ).rejects.toThrow('GitHub CLI (gh) is not installed')
    })

    it('throws if gh output is not a URL', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'gh version 2.40.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'some error output', stderr: '' })

      await expect(
        creator.createPR('/worktree', 'manifold/oslo', { baseBranch: 'main' }),
      ).rejects.toThrow('Unexpected gh output')
    })
  })
})
