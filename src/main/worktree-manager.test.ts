import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRaw = vi.fn()
const mockDeleteLocalBranch = vi.fn()
const mockGitInstance = {
  raw: mockRaw,
  deleteLocalBranch: mockDeleteLocalBranch,
  branch: vi.fn(),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
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
    manager = new WorktreeManager()
  })

  describe('createWorktree', () => {
    it('creates a worktree with a generated branch name', async () => {
      mockRaw.mockResolvedValue('')

      const result = await manager.createWorktree('/repo', 'main')

      expect(generateBranchName).toHaveBeenCalledWith('/repo')
      expect(result.branch).toBe('manifold/oslo')
      expect(result.path).toContain('manifold-oslo')
      expect(mockRaw).toHaveBeenCalledWith([
        'worktree', 'add', '-b', 'manifold/oslo',
        expect.stringContaining('manifold-oslo'),
        'main',
      ])
    })

    it('uses provided branch name instead of generating one', async () => {
      mockRaw.mockResolvedValue('')

      const result = await manager.createWorktree('/repo', 'main', 'manifold/custom-branch')

      expect(generateBranchName).not.toHaveBeenCalled()
      expect(result.branch).toBe('manifold/custom-branch')
    })

    it('creates the worktree directory', async () => {
      mockRaw.mockResolvedValue('')

      await manager.createWorktree('/repo', 'main')

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/repo/.manifold/worktrees',
        { recursive: true }
      )
    })

    it('replaces slashes in branch name for directory naming', async () => {
      mockRaw.mockResolvedValue('')

      const result = await manager.createWorktree('/repo', 'main', 'manifold/nested/branch')

      expect(result.path).toContain('manifold-nested-branch')
    })
  })

  describe('removeWorktree', () => {
    it('removes a worktree and deletes the branch', async () => {
      // Mock listWorktrees via raw call
      mockRaw
        .mockResolvedValueOnce(
          'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n'
        )
        .mockResolvedValueOnce('') // worktree remove
      mockDeleteLocalBranch.mockResolvedValue(undefined)

      await manager.removeWorktree('/repo', '/repo/.manifold/worktrees/manifold-oslo')

      expect(mockRaw).toHaveBeenCalledWith([
        'worktree', 'remove', '/repo/.manifold/worktrees/manifold-oslo', '--force',
      ])
      expect(mockDeleteLocalBranch).toHaveBeenCalledWith('manifold/oslo', true)
    })

    it('does not throw if branch deletion fails', async () => {
      mockRaw
        .mockResolvedValueOnce(
          'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n'
        )
        .mockResolvedValueOnce('')
      mockDeleteLocalBranch.mockRejectedValue(new Error('branch not found'))

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

      mockRaw.mockResolvedValue(porcelain)

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

      mockRaw.mockResolvedValue(porcelain)

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(0)
    })

    it('handles last entry without trailing blank line', async () => {
      const porcelain = [
        'worktree /repo/.manifold/worktrees/manifold-oslo',
        'branch refs/heads/manifold/oslo',
      ].join('\n')

      mockRaw.mockResolvedValue(porcelain)

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('manifold/oslo')
    })

    it('returns empty array for empty output', async () => {
      mockRaw.mockResolvedValue('')

      const result = await manager.listWorktrees('/repo')
      expect(result).toEqual([])
    })
  })
})
