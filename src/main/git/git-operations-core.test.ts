import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const { mockExecFileAsync, mockWriteFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
  mockWriteFile: vi.fn(),
  mockSpawn: vi.fn(),
}))

const {
  mockCommitManagedWorktree,
  mockGetManagedWorktreeStatus,
  mockStageManagedWorktreePath,
} = vi.hoisted(() => ({
  mockCommitManagedWorktree: vi.fn(),
  mockGetManagedWorktreeStatus: vi.fn(),
  mockStageManagedWorktreePath: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  default: { writeFile: mockWriteFile },
}))

vi.mock('node:child_process', () => ({
  default: { execFile: vi.fn(), spawn: mockSpawn },
  execFile: vi.fn(),
  spawn: mockSpawn,
}))

vi.mock('./managed-worktree', () => ({
  commitManagedWorktree: mockCommitManagedWorktree,
  getManagedWorktreeStatus: mockGetManagedWorktreeStatus,
  stageManagedWorktreePath: mockStageManagedWorktreePath,
}))

import { GitOperationsManager } from './git-operations'
import {
  commitManagedWorktree,
  getManagedWorktreeStatus,
  stageManagedWorktreePath,
} from './managed-worktree'

describe('GitOperationsManager core', () => {
  let git: GitOperationsManager

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitOperationsManager()
  })

  describe('commit', () => {
    it('delegates to the managed-worktree commit helper', async () => {
      mockCommitManagedWorktree.mockResolvedValue(undefined)

      await git.commit('/worktree', 'fix: resolve bug')

      expect(commitManagedWorktree).toHaveBeenCalledWith('/worktree', 'fix: resolve bug')
    })

    it('propagates errors from the managed-worktree commit helper', async () => {
      mockCommitManagedWorktree.mockRejectedValueOnce(new Error('nothing to commit'))

      await expect(git.commit('/worktree', 'empty')).rejects.toThrow('nothing to commit')
    })
  })

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

  describe('getConflicts', () => {
    it('parses UU lines from porcelain output', async () => {
      mockGetManagedWorktreeStatus.mockResolvedValue('UU src/conflict.ts\n M src/clean.ts\n')

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual(['src/conflict.ts'])
      expect(getManagedWorktreeStatus).toHaveBeenCalledWith('/worktree')
    })

    it('parses AA and DD lines from porcelain output', async () => {
      mockGetManagedWorktreeStatus.mockResolvedValue('AA src/both-added.ts\nDD src/both-deleted.ts\n')

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual(['src/both-added.ts', 'src/both-deleted.ts'])
    })

    it('returns empty array for clean status', async () => {
      mockGetManagedWorktreeStatus.mockResolvedValue(' M src/file.ts\n?? new.ts\n')

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual([])
    })

    it('returns [] on error', async () => {
      mockGetManagedWorktreeStatus.mockRejectedValue(new Error('git failed'))

      const conflicts = await git.getConflicts('/worktree')

      expect(conflicts).toEqual([])
    })
  })

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
      mockStageManagedWorktreePath.mockResolvedValue(undefined)

      await git.resolveConflict('/worktree', 'src/file.ts', 'resolved content')

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('src/file.ts'),
        'resolved content',
        'utf-8',
      )
      expect(stageManagedWorktreePath).toHaveBeenCalledWith('/worktree', 'src/file.ts')
    })

    it('accepts files in nested subdirectories', async () => {
      mockWriteFile.mockResolvedValue(undefined)
      mockStageManagedWorktreePath.mockResolvedValue(undefined)

      await git.resolveConflict('/worktree', 'src/deep/nested/file.ts', 'content')

      expect(mockWriteFile).toHaveBeenCalled()
      expect(stageManagedWorktreePath).toHaveBeenCalledWith('/worktree', 'src/deep/nested/file.ts')
    })
  })

  describe('aiGenerate', () => {
    function createMockChild(stdout: string, exitCode: number, stderr = '') {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { end: vi.fn() },
        kill: vi.fn(),
      })
      mockSpawn.mockReturnValue(child)
      process.nextTick(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr))
        child.emit('close', exitCode)
      })
      return child
    }

    it('runs Claude non-interactively and returns parsed assistant output', async () => {
      const child = createMockChild(
        '{"type":"assistant","message":{"content":[{"type":"text","text":"generated commit message"}]}}\n',
        0,
      )

      const result = await git.aiGenerate({
        id: 'claude',
        name: 'Claude',
        binary: '/usr/local/bin/claude',
      }, 'write a message', '/worktree')

      expect(result).toBe('generated commit message')
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        [
          '--permission-mode',
          'bypassPermissions',
          '-p',
          'write a message',
          '--output-format',
          'stream-json',
          '--verbose',
        ],
        { cwd: '/worktree', env: undefined, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      expect(child.stdin.end).toHaveBeenCalled()
    })

    it('rejects with a parsed runtime error on non-zero exit', async () => {
      createMockChild(
        '{"type":"turn.failed","error":{"message":"stream disconnected before completion"}}\n',
        1,
      )

      await expect(git.aiGenerate({
        id: 'codex',
        name: 'Codex',
        binary: '/usr/local/bin/codex',
      }, 'prompt', '/worktree')).rejects.toThrow(
        'AI runtime "codex" failed (exit code 1): stream disconnected before completion',
      )
    })

    it('passes extra args into the codex exec command and parses JSONL output', async () => {
      createMockChild('{"type":"item.completed","item":{"type":"agent_message","text":"ai message"}}\n', 0)

      const result = await git.aiGenerate({
        id: 'codex',
        name: 'Codex',
        binary: '/usr/local/bin/codex',
      }, 'prompt', '/worktree', ['--model', 'o4-mini'])

      expect(result).toBe('ai message')
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/codex',
        ['exec', '--full-auto', '--json', '--model', 'o4-mini', 'prompt'],
        { cwd: '/worktree', env: undefined, stdio: ['pipe', 'pipe', 'pipe'] },
      )
    })

    it('rejects on spawn error', async () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { end: vi.fn() },
        kill: vi.fn(),
      })
      mockSpawn.mockReturnValue(child)
      process.nextTick(() => {
        child.emit('error', new Error('ENOENT'))
      })

      await expect(git.aiGenerate({
        id: 'claude',
        name: 'Claude',
        binary: '/nonexistent/binary',
      }, 'prompt', '/cwd')).rejects.toThrow(
        'AI runtime "claude" failed to start: ENOENT',
      )
    })
  })
})
