import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---------- mocks ----------

const { spawnMock, execFileMock, existsSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn(() => true),
}))

vi.mock('node:fs', () => ({
  default: { existsSync: existsSyncMock },
  existsSync: existsSyncMock,
}))

vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock, execFile: execFileMock },
  execFile: execFileMock,
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
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback?.(null, '', '')
      return {} as ChildProcess
    })
    provider = new DiffProvider()
  })

  // ---- getDiff ----

  describe('getDiff', () => {
    it('returns working-tree diff against base branch without staging', async () => {
      queueSpawn('the full diff') // git diff --find-renames main
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const result = await provider.getDiff('/worktree', 'main')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['diff', '--find-renames', 'main'],
        expect.objectContaining({ cwd: '/worktree' })
      )
      expect(spawnMock).not.toHaveBeenCalledWith('git', ['add', '.'], expect.anything())
      expect(result).toBe('the full diff')
    })

    it('returns empty string when diff produces no output', async () => {
      queueSpawn('') // git diff --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('')
    })

    it('continues even if tracked diff fails', async () => {
      queueSpawn('', 'fatal: bad revision', 1) // git diff fails
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const result = await provider.getDiff('/worktree', 'main')
      expect(result).toBe('')
    })

    it('returns empty string when worktree path does not exist', async () => {
      existsSyncMock.mockReturnValue(false)

      const result = await provider.getDiff('/nonexistent', 'main')

      expect(result).toBe('')
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('uses the correct base branch in the diff command', async () => {
      queueSpawn('branch diff') // git diff --find-renames develop
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const result = await provider.getDiff('/worktree', 'develop')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['diff', '--find-renames', 'develop'],
        expect.objectContaining({ cwd: '/worktree' })
      )
      expect(result).toBe('branch diff')
    })
  })

  // ---- getChangedFiles ----

  describe('getChangedFiles', () => {
    it('returns file changes parsed from numstat output', async () => {
      const nameStatus = [
        'A\tsrc/new.ts',
        'D\tsrc/old.ts',
        'M\tsrc/mod.ts',
      ].join('\n')

      queueSpawn(nameStatus) // git diff --name-status --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

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
      queueSpawn('') // git diff --name-status --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('handles diff failure gracefully by returning empty array', async () => {
      queueSpawn('', 'no commits', 128) // diff fails
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('treats renames as modified', async () => {
      const nameStatus = 'R100\told-name.ts\tnew-name.ts'

      queueSpawn(nameStatus) // git diff --name-status --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'new-name.ts', type: 'modified' })
    })

    it('includes untracked files as added without staging them', async () => {
      queueSpawn('') // git diff --name-status --find-renames
      queueSpawn('new/untracked.ts\u0000') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'new/untracked.ts', type: 'added' })
    })
  })
})
