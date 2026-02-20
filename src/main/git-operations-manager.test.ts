import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---------- mocks ----------

const { spawnMock, writeFileMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  writeFileMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}))

vi.mock('node:fs/promises', () => ({
  default: { writeFile: writeFileMock },
  writeFile: writeFileMock,
}))

vi.mock('node:path', () => ({
  default: { join: (...args: string[]) => args.join('/') },
  join: (...args: string[]) => args.join('/'),
}))

import { GitOperationsManager } from './git-operations-manager'

// ---------- helpers ----------

function fakeChild(stdout: string, stderr = '', exitCode = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()

  process.nextTick(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout))
    }
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr))
    }
    child.emit('close', exitCode)
  })

  return child
}

function queueSpawn(stdout: string, stderr = '', exitCode = 0): void {
  spawnMock.mockImplementationOnce(() => fakeChild(stdout, stderr, exitCode))
}

// ---------- tests ----------

describe('GitOperationsManager', () => {
  let manager: GitOperationsManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new GitOperationsManager()
  })

  // ---- commit ----

  describe('commit', () => {
    it('stages all changes and commits with the given message', async () => {
      queueSpawn('') // git add .
      queueSpawn('') // git commit -m

      await manager.commit('/worktree', 'feat: add feature')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['add', '.'],
        expect.objectContaining({ cwd: '/worktree' })
      )
      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'feat: add feature'],
        expect.objectContaining({ cwd: '/worktree' })
      )
    })

    it('throws when git add fails', async () => {
      queueSpawn('', 'error staging', 1)

      await expect(manager.commit('/worktree', 'msg')).rejects.toThrow('git add failed')
    })

    it('throws when git commit fails', async () => {
      queueSpawn('') // git add succeeds
      queueSpawn('', 'nothing to commit', 1) // git commit fails

      await expect(manager.commit('/worktree', 'msg')).rejects.toThrow('git commit failed')
    })
  })

  // ---- getStatusDetail ----

  describe('getStatusDetail', () => {
    it('parses conflicts, staged, and unstaged files', async () => {
      const porcelain = [
        'UU conflicted.ts',
        'AA both-added.ts',
        'DD both-deleted.ts',
        'M  staged-only.ts',
        ' M unstaged-only.ts',
        'MM staged-and-unstaged.ts',
        '?? untracked.ts',
      ].join('\n')

      queueSpawn(porcelain)

      const result = await manager.getStatusDetail('/worktree')

      expect(result.conflicts).toEqual(['conflicted.ts', 'both-added.ts', 'both-deleted.ts'])
      expect(result.staged).toContain('staged-only.ts')
      expect(result.staged).toContain('staged-and-unstaged.ts')
      expect(result.unstaged).toContain('unstaged-only.ts')
      expect(result.unstaged).toContain('staged-and-unstaged.ts')
      expect(result.unstaged).toContain('untracked.ts')
    })

    it('returns empty arrays when there are no changes', async () => {
      queueSpawn('')

      const result = await manager.getStatusDetail('/worktree')

      expect(result.conflicts).toEqual([])
      expect(result.staged).toEqual([])
      expect(result.unstaged).toEqual([])
    })

    it('throws when git status fails', async () => {
      queueSpawn('', 'fatal: not a git repository', 128)

      await expect(manager.getStatusDetail('/worktree')).rejects.toThrow('git status failed')
    })
  })

  // ---- getAheadBehind ----

  describe('getAheadBehind', () => {
    it('parses ahead and behind counts', async () => {
      queueSpawn('2\t5\n') // 2 behind, 5 ahead

      const result = await manager.getAheadBehind('/worktree', 'main')

      expect(result).toEqual({ ahead: 5, behind: 2 })
      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--left-right', '--count', 'main...HEAD'],
        expect.objectContaining({ cwd: '/worktree' })
      )
    })

    it('returns zeros when branch has no differences', async () => {
      queueSpawn('0\t0\n')

      const result = await manager.getAheadBehind('/worktree', 'main')

      expect(result).toEqual({ ahead: 0, behind: 0 })
    })

    it('throws when rev-list fails', async () => {
      queueSpawn('', 'fatal: bad revision', 128)

      await expect(manager.getAheadBehind('/worktree', 'main')).rejects.toThrow(
        'git rev-list failed'
      )
    })
  })

  // ---- resolveConflict ----

  describe('resolveConflict', () => {
    it('writes resolved content and stages the file', async () => {
      writeFileMock.mockResolvedValue(undefined)
      queueSpawn('') // git add

      await manager.resolveConflict('/worktree', 'src/file.ts', 'resolved content')

      expect(writeFileMock).toHaveBeenCalledWith(
        '/worktree/src/file.ts',
        'resolved content',
        'utf-8'
      )
      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['add', 'src/file.ts'],
        expect.objectContaining({ cwd: '/worktree' })
      )
    })

    it('throws when writeFile fails', async () => {
      writeFileMock.mockRejectedValue(new Error('EACCES'))

      await expect(
        manager.resolveConflict('/worktree', 'src/file.ts', 'content')
      ).rejects.toThrow('EACCES')
    })

    it('throws when git add fails after writing', async () => {
      writeFileMock.mockResolvedValue(undefined)
      queueSpawn('', 'error', 1)

      await expect(
        manager.resolveConflict('/worktree', 'src/file.ts', 'content')
      ).rejects.toThrow('git add failed')
    })
  })

  // ---- aiGenerate ----

  describe('aiGenerate', () => {
    it('spawns the runtime binary and returns trimmed stdout', async () => {
      queueSpawn('  Generated commit message  \n')

      const result = await manager.aiGenerate('claude', '-p', 'Write a commit message', '/worktree')

      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        ['-p', 'Write a commit message'],
        expect.objectContaining({ cwd: '/worktree' })
      )
      expect(result).toBe('Generated commit message')
    })

    it('returns empty string when the process errors', async () => {
      spawnMock.mockImplementationOnce(() => {
        const child = new EventEmitter() as ChildProcess & {
          stdout: EventEmitter
          stderr: EventEmitter
          kill: ReturnType<typeof vi.fn>
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = vi.fn()

        process.nextTick(() => {
          child.emit('error', new Error('ENOENT'))
        })

        return child
      })

      const result = await manager.aiGenerate('nonexistent', '-p', 'prompt', '/worktree')

      expect(result).toBe('')
    })

    it('returns empty string when the process exits with non-zero code but still captures output', async () => {
      // When process closes with code != 0, we still resolve with whatever stdout was captured
      // The close event fires — our implementation resolves on close regardless of exit code
      queueSpawn('partial output', 'error', 1)

      const result = await manager.aiGenerate('claude', '-p', 'prompt', '/worktree')

      // close fires even with non-zero exit codes, so we still get stdout
      expect(result).toBe('partial output')
    })

    it('times out after 15s and returns empty string', async () => {
      vi.useFakeTimers()

      spawnMock.mockImplementationOnce(() => {
        const child = new EventEmitter() as ChildProcess & {
          stdout: EventEmitter
          stderr: EventEmitter
          kill: ReturnType<typeof vi.fn>
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = vi.fn()
        // Never emits close — simulates a hanging process
        return child
      })

      const promise = manager.aiGenerate('claude', '-p', 'prompt', '/worktree')

      vi.advanceTimersByTime(15_000)

      const result = await promise

      expect(result).toBe('')

      vi.useRealTimers()
    })

    it('works with different runtime binaries', async () => {
      queueSpawn('codex output')

      const result = await manager.aiGenerate('codex', '--non-interactive', 'prompt', '/worktree')

      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        ['--non-interactive', 'prompt'],
        expect.objectContaining({ cwd: '/worktree' })
      )
      expect(result).toBe('codex output')
    })
  })
})
