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
    /**
     * getChangedFiles first determines this worktree's own changed paths
     * (committed since the merge-base, then uncommitted), so queue those two
     * provenance commands before the name-status diff and untracked listing.
     */
    function queueOwnPaths(committed: string, working = ''): void {
      queueSpawn(committed) // git diff --name-only --find-renames <base>...HEAD
      queueSpawn(working) // git diff --name-only --find-renames HEAD
    }

    it('returns file changes parsed from numstat output', async () => {
      const nameStatus = [
        'A\tsrc/new.ts',
        'D\tsrc/old.ts',
        'M\tsrc/mod.ts',
      ].join('\n')

      queueOwnPaths('src/new.ts\nsrc/old.ts\nsrc/mod.ts')
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
      queueOwnPaths('')
      queueSpawn('') // git diff --name-status --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('handles diff failure gracefully by returning empty array', async () => {
      queueOwnPaths('')
      queueSpawn('', 'no commits', 128) // diff fails
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toEqual([])
    })

    it('treats renames as modified', async () => {
      const nameStatus = 'R100\told-name.ts\tnew-name.ts'

      queueOwnPaths('new-name.ts')
      queueSpawn(nameStatus) // git diff --name-status --find-renames
      queueSpawn('') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'new-name.ts', type: 'modified' })
    })

    it('includes untracked files as added without staging them', async () => {
      queueOwnPaths('')
      queueSpawn('') // git diff --name-status --find-renames
      queueSpawn('new/untracked.ts\u0000') // git ls-files --others --exclude-standard -z

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'new/untracked.ts', type: 'added' })
    })

    // ---- provenance: foreignWorktree ----

    it('marks files changed only on the base branch as foreignWorktree', async () => {
      const nameStatus = [
        'M\tsrc/mine.ts',
        'A\tdocs/from-other.md',
        'M\tREADME.md',
      ].join('\n')

      // This worktree only committed src/mine.ts; README.md and docs/from-other.md
      // appear solely because the base branch advanced (another worktree).
      queueOwnPaths('src/mine.ts')
      queueSpawn(nameStatus)
      queueSpawn('') // ls-files

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/mine.ts', type: 'modified' })
      expect(changes).toContainEqual({ path: 'docs/from-other.md', type: 'added', foreignWorktree: true })
      expect(changes).toContainEqual({ path: 'README.md', type: 'modified', foreignWorktree: true })
    })

    it('treats uncommitted working-tree edits as this worktree\'s own', async () => {
      // Nothing committed since the merge-base, but the file is edited locally.
      queueOwnPaths('', 'src/edited.ts')
      queueSpawn('M\tsrc/edited.ts')
      queueSpawn('') // ls-files

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/edited.ts', type: 'modified' })
    })

    it('marks nothing foreign when provenance cannot be determined', async () => {
      // The merge-base diff fails (e.g. no commits yet) — without provenance we
      // must not guess, so no file is flagged foreign.
      queueSpawn('', 'unknown revision', 128) // <base>...HEAD fails
      queueSpawn('M\tsrc/a.ts\nA\tdocs/b.md') // name-status
      queueSpawn('') // ls-files

      const changes = await provider.getChangedFiles('/worktree', 'main')

      expect(changes).toContainEqual({ path: 'src/a.ts', type: 'modified' })
      expect(changes).toContainEqual({ path: 'docs/b.md', type: 'added' })
      expect(changes.every((c) => c.foreignWorktree === undefined)).toBe(true)
    })
  })

  // ---- getDiffStats ----

  describe('getDiffStats', () => {
    it('parses numstat output into added/removed/filesChanged', async () => {
      queueSpawn('5\t2\tsrc/a.ts\n0\t10\tsrc/b.ts\n')

      const stats = await provider.getDiffStats('/worktree', 'main')

      expect(stats).toEqual({
        diffLines: { added: 5, removed: 12 },
        filesChanged: 2,
      })
    })

    it('returns zero stats when output is empty', async () => {
      queueSpawn('')

      const stats = await provider.getDiffStats('/worktree', 'main')

      expect(stats).toEqual({
        diffLines: { added: 0, removed: 0 },
        filesChanged: 0,
      })
    })

    it('returns zero stats when worktree does not exist', async () => {
      existsSyncMock.mockReturnValue(false)

      const stats = await provider.getDiffStats('/nonexistent', 'main')

      expect(stats).toEqual({
        diffLines: { added: 0, removed: 0 },
        filesChanged: 0,
      })
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('returns zero stats when git diff fails', async () => {
      queueSpawn('', 'no commits', 128)

      const stats = await provider.getDiffStats('/worktree', 'main')

      expect(stats).toEqual({
        diffLines: { added: 0, removed: 0 },
        filesChanged: 0,
      })
    })
  })
})
