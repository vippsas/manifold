import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFileAsync, mockWriteFile } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  default: { writeFile: mockWriteFile },
}))

import { GitOperationsManager } from './git-operations'

describe('GitOperationsManager', () => {
  let git: GitOperationsManager

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitOperationsManager()
  })

  // ---- commit ----

  describe('commit', () => {
    it('calls git add then git commit with correct args', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await git.commit('/worktree', 'fix: resolve bug')

      expect(mockExecFileAsync).toHaveBeenCalledTimes(2)
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        1,
        'git',
        ['add', '.'],
        { cwd: '/worktree' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        2,
        'git',
        ['commit', '-m', 'fix: resolve bug'],
        { cwd: '/worktree' },
      )
    })

    it('propagates errors from git commit', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add succeeds
        .mockRejectedValueOnce(new Error('nothing to commit'))

      await expect(git.commit('/worktree', 'empty')).rejects.toThrow('nothing to commit')
    })
  })

  // ---- getAheadBehind ----

  describe('getAheadBehind', () => {
    it('parses rev-list output correctly', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '3\t5\n', stderr: '' })

      const result = await git.getAheadBehind('/worktree', 'main')

      expect(result).toEqual({ ahead: 5, behind: 3 })
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--left-right', '--count', 'main...HEAD'],
        { cwd: '/worktree' },
      )
    })

    it('handles tab-separated output', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '0\t12\n', stderr: '' })

      const result = await git.getAheadBehind('/worktree', 'origin/main')

      expect(result).toEqual({ ahead: 12, behind: 0 })
    })

    it('returns {0,0} on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not a git repo'))

      const result = await git.getAheadBehind('/worktree', 'main')

      expect(result).toEqual({ ahead: 0, behind: 0 })
    })
  })

  // ---- getConflicts ----

  describe('getConflicts', () => {
    it('parses UU lines from porcelain output', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'UU src/conflict.ts\n M src/clean.ts\n',
        stderr: '',
      })

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual(['src/conflict.ts'])
    })

    it('parses AA and DD lines from porcelain output', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'AA src/both-added.ts\nDD src/both-deleted.ts\n',
        stderr: '',
      })

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual(['src/both-added.ts', 'src/both-deleted.ts'])
    })

    it('returns empty array for clean status', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: ' M src/file.ts\n?? new.ts\n', stderr: '' })

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual([])
    })

    it('returns [] on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('git failed'))

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual([])
    })
  })

  // ---- resolveConflict ----

  describe('resolveConflict', () => {
    it('validates path traversal and rejects paths outside worktree', async () => {
      await expect(
        git.resolveConflict('/worktree', '../../etc/passwd', 'hacked'),
      ).rejects.toThrow('Path traversal denied')
    })

    it('rejects path with .. traversal', async () => {
      await expect(
        git.resolveConflict('/worktree', '../outside/file.ts', 'content'),
      ).rejects.toThrow('Path traversal denied')
    })

    it('writes file and runs git add for valid paths', async () => {
      mockWriteFile.mockResolvedValue(undefined)
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await git.resolveConflict('/worktree', 'src/file.ts', 'resolved content')

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('src/file.ts'),
        'resolved content',
        'utf-8',
      )
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['add', '--', 'src/file.ts'],
        { cwd: '/worktree' },
      )
    })

    it('accepts files in nested subdirectories', async () => {
      mockWriteFile.mockResolvedValue(undefined)
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await git.resolveConflict('/worktree', 'src/deep/nested/file.ts', 'content')

      expect(mockWriteFile).toHaveBeenCalled()
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['add', '--', 'src/deep/nested/file.ts'],
        { cwd: '/worktree' },
      )
    })
  })

  // ---- aiGenerate ----

  describe('aiGenerate', () => {
    it('returns trimmed stdout', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: '  generated commit message  \n',
        stderr: '',
      })

      const result = await git.aiGenerate('/usr/local/bin/claude', 'write a message', '/worktree')

      expect(result).toBe('generated commit message')
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['-p', 'write a message'],
        { cwd: '/worktree', timeout: 15_000 },
      )
    })

    it('returns empty string on timeout/error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await git.aiGenerate('/usr/local/bin/claude', 'prompt', '/worktree')

      expect(result).toBe('')
    })

    it('returns empty string when binary not found', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ENOENT'))

      const result = await git.aiGenerate('/nonexistent/binary', 'prompt', '/cwd')

      expect(result).toBe('')
    })
  })

  // ---- getPRContext ----

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
})
