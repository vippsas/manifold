import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---------- mocks ----------

const { spawnMock, existsSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn(() => true),
}))

vi.mock('node:fs', () => ({
  default: { existsSync: existsSyncMock },
  existsSync: existsSyncMock,
}))

vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}))

import { DiffProvider } from './diff-provider'

// ---------- helpers ----------

/**
 * Creates a fake ChildProcess that emits stdout data and then closes.
 * Data emission is deferred via process.nextTick so callers can attach listeners first.
 */
function fakeChild(stdout: string, stderr = '', exitCode = 0): ChildProcess {
  const emitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const stderrEmitter = new EventEmitter()
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter })

  process.nextTick(() => {
    if (stdout) {
      stdoutEmitter.emit('data', Buffer.from(stdout))
    }
    if (stderr) {
      stderrEmitter.emit('data', Buffer.from(stderr))
    }
    emitter.emit('close', exitCode)
  })

  return emitter as unknown as ChildProcess
}

/**
 * Queues a spawn mock that lazily creates a fakeChild when spawn() is actually called.
 * This ensures process.nextTick fires after the implementation attaches listeners.
 */
function queueSpawn(stdout: string, stderr = '', exitCode = 0): void {
  spawnMock.mockImplementationOnce(() => fakeChild(stdout, stderr, exitCode))
}

// ---------- tests ----------

describe('DiffProvider', () => {
  let provider: DiffProvider

  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    provider = new DiffProvider()
  })

  // ---- getDiff ----

  describe('getDiff', () => {
    it('stages all changes and returns cached diff against base branch', async () => {
      queueSpawn('') // git add .
      queueSpawn('the full diff') // git diff --cached main

      const result = await provider.getDiff('/worktree', 'main')

      expect(spawnMock).toHaveBeenCalledWith('git', ['add', '.'], expect.objectContaining({ cwd: '/worktree' }))
      expect(spawnMock).toHaveBeenCalledWith('git', ['diff', '--cached', 'main'], expect.objectContaining({ cwd: '/worktree' }))
      expect(result).toBe('the full diff')
    })

    it('returns empty string when diff produces no output', async () => {
      queueSpawn('') // git add
      queueSpawn('') // git diff --cached

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('')
    })

    it('continues even if git add fails', async () => {
      queueSpawn('', 'nothing to add', 1) // git add fails
      queueSpawn('diff output') // git diff still succeeds

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('diff output')
    })

    it('returns empty string when worktree path does not exist', async () => {
      existsSyncMock.mockReturnValue(false)

      const result = await provider.getDiff('/nonexistent', 'main')

      expect(result).toBe('')
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('uses the correct base branch in the diff command', async () => {
      queueSpawn('') // git add
      queueSpawn('branch diff') // git diff --cached develop

      const result = await provider.getDiff('/worktree', 'develop')

      expect(spawnMock).toHaveBeenCalledWith('git', ['diff', '--cached', 'develop'], expect.objectContaining({ cwd: '/worktree' }))
      expect(result).toBe('branch diff')
    })
  })

  // ---- getChangedFiles ----

  describe('getChangedFiles', () => {
    it('returns file changes parsed from numstat output', async () => {
      const numstat = [
        '10\t0\tsrc/new.ts',
        '0\t5\tsrc/old.ts',
        '3\t2\tsrc/mod.ts',
      ].join('\n')

      queueSpawn('') // git add
      queueSpawn(numstat) // git diff --cached --numstat

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/new.ts', type: 'added' })
      expect(changes).toContainEqual({ path: 'src/old.ts', type: 'deleted' })
      expect(changes).toContainEqual({ path: 'src/mod.ts', type: 'modified' })
    })

    it('returns empty array when worktree path does not exist', async () => {
      existsSyncMock.mockReturnValue(false)

      const changes = await provider.getChangedFiles('/nonexistent', 'main')

      expect(changes).toEqual([])
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('returns empty array when numstat output is empty', async () => {
      queueSpawn('') // git add
      queueSpawn('') // git diff --cached --numstat (empty)

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('handles diff failure gracefully by returning empty array', async () => {
      queueSpawn('') // git add
      queueSpawn('', 'no commits', 128) // diff fails

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('handles binary files (shown as dashes in numstat) as modified', async () => {
      const numstat = '-\t-\timage.png'

      queueSpawn('') // git add
      queueSpawn(numstat) // git diff --cached --numstat

      const changes = await provider.getChangedFiles('/worktree', 'main')

      // Binary files have '-' for insertions/deletions, parsed as 0/0 → type stays 'modified'
      expect(changes).toContainEqual({ path: 'image.png', type: 'modified' })
    })

    it('continues even if git add fails before numstat', async () => {
      queueSpawn('', 'error', 1) // git add fails
      queueSpawn('5\t0\tsrc/file.ts') // diff still works

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/file.ts', type: 'added' })
    })
  })
})
