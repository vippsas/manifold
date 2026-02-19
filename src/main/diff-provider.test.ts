import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAdd = vi.fn()
const mockDiff = vi.fn()
const mockDiffSummary = vi.fn()
const mockStatus = vi.fn()

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    add: mockAdd,
    diff: mockDiff,
    diffSummary: mockDiffSummary,
    status: mockStatus,
  })),
}))

import { DiffProvider } from './diff-provider'

describe('DiffProvider', () => {
  let provider: DiffProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new DiffProvider()
  })

  describe('getDiff', () => {
    it('stages all changes and returns combined diff', async () => {
      mockAdd.mockResolvedValue(undefined)
      mockDiff
        .mockResolvedValueOnce('committed diff')
        .mockResolvedValueOnce('staged diff')

      const result = await provider.getDiff('/worktree', 'main')

      expect(mockAdd).toHaveBeenCalledWith('.')
      expect(mockDiff).toHaveBeenCalledWith(['main...HEAD'])
      expect(mockDiff).toHaveBeenCalledWith(['--cached'])
      expect(result).toBe('committed diff\nstaged diff')
    })

    it('returns only committed diff when no staged changes', async () => {
      mockAdd.mockResolvedValue(undefined)
      mockDiff
        .mockResolvedValueOnce('committed diff')
        .mockResolvedValueOnce('')

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('committed diff')
    })

    it('returns only staged diff when no committed changes', async () => {
      mockAdd.mockResolvedValue(undefined)
      mockDiff
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('staged diff')

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('staged diff')
    })

    it('returns empty string when no diffs at all', async () => {
      mockAdd.mockResolvedValue(undefined)
      mockDiff
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('')
    })

    it('continues even if git add fails', async () => {
      mockAdd.mockRejectedValue(new Error('nothing to add'))
      mockDiff
        .mockResolvedValueOnce('diff')
        .mockResolvedValueOnce('')

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('diff')
    })
  })

  describe('getChangedFiles', () => {
    it('returns committed and uncommitted changes', async () => {
      mockDiffSummary.mockResolvedValue({
        files: [
          { file: 'src/new.ts', binary: false, insertions: 10, deletions: 0 },
          { file: 'src/old.ts', binary: false, insertions: 0, deletions: 5 },
          { file: 'src/mod.ts', binary: false, insertions: 3, deletions: 2 },
        ],
      })

      mockStatus.mockResolvedValue({
        created: [],
        modified: ['src/extra.ts'],
        deleted: [],
      })

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/new.ts', type: 'added' })
      expect(changes).toContainEqual({ path: 'src/old.ts', type: 'deleted' })
      expect(changes).toContainEqual({ path: 'src/mod.ts', type: 'modified' })
      expect(changes).toContainEqual({ path: 'src/extra.ts', type: 'modified' })
    })

    it('deduplicates files between committed and status', async () => {
      mockDiffSummary.mockResolvedValue({
        files: [
          { file: 'src/file.ts', binary: false, insertions: 1, deletions: 1 },
        ],
      })

      mockStatus.mockResolvedValue({
        created: [],
        modified: ['src/file.ts'],
        deleted: [],
      })

      const changes = await provider.getChangedFiles('/worktree', 'main')
      const filePaths = changes.map((c) => c.path)
      expect(filePaths.filter((p) => p === 'src/file.ts')).toHaveLength(1)
    })

    it('handles binary files as modified', async () => {
      mockDiffSummary.mockResolvedValue({
        files: [
          { file: 'image.png', binary: true, before: 0, after: 0 },
        ],
      })

      mockStatus.mockResolvedValue({
        created: [],
        modified: [],
        deleted: [],
      })

      const changes = await provider.getChangedFiles('/worktree', 'main')
      expect(changes).toContainEqual({ path: 'image.png', type: 'modified' })
    })

    it('handles diffSummary failure gracefully', async () => {
      mockDiffSummary.mockRejectedValue(new Error('no commits'))
      mockStatus.mockResolvedValue({
        created: ['new-file.ts'],
        modified: [],
        deleted: [],
      })

      const changes = await provider.getChangedFiles('/worktree', 'main')
      expect(changes).toContainEqual({ path: 'new-file.ts', type: 'added' })
    })

    it('handles status failure gracefully', async () => {
      mockDiffSummary.mockResolvedValue({
        files: [
          { file: 'src/file.ts', binary: false, insertions: 5, deletions: 0 },
        ],
      })
      mockStatus.mockRejectedValue(new Error('status failed'))

      const changes = await provider.getChangedFiles('/worktree', 'main')
      expect(changes).toHaveLength(1)
      expect(changes[0].path).toBe('src/file.ts')
    })

    it('returns empty array when both fail', async () => {
      mockDiffSummary.mockRejectedValue(new Error('fail'))
      mockStatus.mockRejectedValue(new Error('fail'))

      const changes = await provider.getChangedFiles('/worktree', 'main')
      expect(changes).toEqual([])
    })

    it('includes created files from status', async () => {
      mockDiffSummary.mockResolvedValue({ files: [] })
      mockStatus.mockResolvedValue({
        created: ['brand-new.ts'],
        modified: [],
        deleted: ['removed.ts'],
      })

      const changes = await provider.getChangedFiles('/worktree', 'main')
      expect(changes).toContainEqual({ path: 'brand-new.ts', type: 'added' })
      expect(changes).toContainEqual({ path: 'removed.ts', type: 'deleted' })
    })
  })
})
