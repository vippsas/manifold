import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecFile = vi.fn()

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecFile,
}))

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('./branch-namer', () => ({
  generateBranchName: vi.fn().mockResolvedValue('manifold/oslo'),
}))

import { WorktreeManager } from './worktree-manager'
import { generateBranchName } from './branch-namer'
import * as fs from 'node:fs'

describe('WorktreeManager', () => {
  let manager: WorktreeManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorktreeManager('/mock-home/.manifold')
  })

  describe('createWorktree', () => {
    it('creates a worktree with a generated branch name', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await manager.createWorktree('/repo', 'main', 'proj-1')

      expect(generateBranchName).toHaveBeenCalledWith('/repo')
      expect(result.branch).toBe('manifold/oslo')
      expect(result.path).toContain('manifold-oslo')
      expect(result.path).toContain('/mock-home/.manifold/worktrees/proj-1/')
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'manifold/oslo', expect.stringContaining('manifold-oslo'), 'main'],
        { cwd: '/repo' }
      )
    })

    it('uses provided branch name instead of generating one', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'manifold/custom-branch')

      expect(generateBranchName).not.toHaveBeenCalled()
      expect(result.branch).toBe('manifold/custom-branch')
    })

    it('creates the worktree directory', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await manager.createWorktree('/repo', 'main', 'proj-1')

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/mock-home/.manifold/worktrees/proj-1',
        { recursive: true }
      )
    })

    it('replaces slashes in branch name for directory naming', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'manifold/nested/branch')

      expect(result.path).toContain('manifold-nested-branch')
    })
  })

  describe('removeWorktree', () => {
    it('removes a worktree and deletes the branch', async () => {
      // First call: listWorktrees (worktree list --porcelain)
      // Second call: worktree remove
      // Third call: branch -D
      mockExecFile
        .mockResolvedValueOnce({
          stdout: 'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await manager.removeWorktree('/repo', '/repo/.manifold/worktrees/manifold-oslo')

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/repo/.manifold/worktrees/manifold-oslo', '--force'],
        { cwd: '/repo' }
      )
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['branch', '-D', 'manifold/oslo'],
        { cwd: '/repo' }
      )
    })

    it('does not throw if branch deletion fails', async () => {
      mockExecFile
        .mockResolvedValueOnce({
          stdout: 'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockRejectedValueOnce(new Error('branch not found'))

      await expect(
        manager.removeWorktree('/repo', '/repo/.manifold/worktrees/manifold-oslo')
      ).resolves.toBeUndefined()
    })
  })

  describe('listWorktrees', () => {
    it('parses porcelain output and filters manifold branches', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /repo/.manifold/worktrees/manifold-oslo',
        'branch refs/heads/manifold/oslo',
        '',
        'worktree /repo/.manifold/worktrees/manifold-bergen',
        'branch refs/heads/manifold/bergen',
        '',
      ].join('\n')

      mockExecFile.mockResolvedValue({ stdout: porcelain, stderr: '' })

      const result = await manager.listWorktrees('/repo')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        branch: 'manifold/oslo',
        path: '/repo/.manifold/worktrees/manifold-oslo',
      })
      expect(result[1]).toEqual({
        branch: 'manifold/bergen',
        path: '/repo/.manifold/worktrees/manifold-bergen',
      })
    })

    it('excludes non-manifold worktrees', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /some/other',
        'branch refs/heads/feature/xyz',
        '',
      ].join('\n')

      mockExecFile.mockResolvedValue({ stdout: porcelain, stderr: '' })

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(0)
    })

    it('handles last entry without trailing blank line', async () => {
      const porcelain = [
        'worktree /repo/.manifold/worktrees/manifold-oslo',
        'branch refs/heads/manifold/oslo',
      ].join('\n')

      mockExecFile.mockResolvedValue({ stdout: porcelain, stderr: '' })

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('manifold/oslo')
    })

    it('returns empty array for empty output', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await manager.listWorktrees('/repo')
      expect(result).toEqual([])
    })
  })
})
