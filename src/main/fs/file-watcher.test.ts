import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  cpSync: vi.fn(),
}))

// buildChangeFingerprint now stats async via node:fs/promises; route it through
// the same statSync mock so existing per-test stat setups drive both.
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  relative: (from: string, to: string) => to.replace(from + '/', ''),
  basename: (p: string) => p.split('/').pop() ?? p,
}))

import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import { FileWatcher } from './file-watcher'
import type { BrowserWindow } from 'electron'

const mockStatSync = vi.mocked(fs.statSync)
const mockStat = vi.mocked(fsp.stat)

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('FileWatcher', () => {
  let watcher: FileWatcher
  let mockGitStatus: ReturnType<typeof vi.fn<(cwd: string) => Promise<string>>>
  let mockGitBranch: ReturnType<typeof vi.fn<(cwd: string) => Promise<string>>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGitStatus = vi.fn<(cwd: string) => Promise<string>>().mockResolvedValue('')
    mockGitBranch = vi.fn<(cwd: string) => Promise<string>>().mockResolvedValue('agent/one')
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 1,
      size: 1,
    } as unknown as fs.Stats)
    // Async stat delegates to the statSync mock so each test's stat setup applies.
    mockStat.mockImplementation(async (...args) =>
      (mockStatSync as unknown as (...a: unknown[]) => fs.Stats)(...(args as unknown[])),
    )
    watcher = new FileWatcher(mockGitStatus, undefined, undefined, mockGitBranch)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    vi.useRealTimers()
  })

  describe('watch', () => {
    it('polls git status for the path', async () => {
      watcher.watch('/repo/worktree', 'session-1')

      // Initial poll fires immediately (flush microtasks)
      await vi.advanceTimersByTimeAsync(10)

      expect(mockGitStatus).toHaveBeenCalledWith('/repo/worktree')
    })

    it('does not create duplicate polls for same path', async () => {
      watcher.watch('/repo/worktree', 'session-1')
      watcher.watch('/repo/worktree', 'session-1')

      await vi.advanceTimersByTimeAsync(10)

      expect(mockGitStatus).toHaveBeenCalledTimes(1)
    })

    it('re-points events to the new sessionId when an already-watched path is re-watched', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10) // initial empty poll for session-1

      // Reused worktree: a new session re-watches the same path.
      watcher.watch('/repo/worktree', 'session-2')
      vi.mocked(mockWindow.webContents.send).mockClear()

      mockGitStatus.mockResolvedValue(' M src/file.ts\n')
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        expect.objectContaining({ sessionId: 'session-2' }),
      )
      // The old session id is no longer emitted for this path.
      const sessionIds = vi.mocked(mockWindow.webContents.send).mock.calls
        .filter((c: unknown[]) => c[0] === 'files:changed')
        .map((c: unknown[]) => (c[1] as { sessionId: string }).sessionId)
      expect(sessionIds).not.toContain('session-1')
    })

    it('polls again after the interval', async () => {
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10) // initial poll

      await vi.advanceTimersByTimeAsync(2000) // next tick

      expect(mockGitStatus).toHaveBeenCalledTimes(2)
    })

    it('sends files:changed when status changes', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      // Initial poll returns empty
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      // Next poll returns a modified file
      mockGitStatus.mockResolvedValue(' M src/file.ts\n')
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        {
          sessionId: 'session-1',
          changes: [{ path: 'src/file.ts', type: 'modified' }],
        },
      )
    })

    it('does not send files:changed when status is unchanged', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      mockGitStatus.mockResolvedValue(' M src/file.ts\n')
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10) // initial poll sends change

      vi.mocked(mockWindow.webContents.send).mockClear()

      // Same status on next poll
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('sends files:changed when a dirty file changes again without a new git status', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      mockGitStatus.mockResolvedValue(' M src/file.ts\n')
      mockStatSync
        .mockReset()
        .mockReturnValueOnce({
          isDirectory: () => false,
          mtimeMs: 1,
          size: 10,
        } as unknown as fs.Stats)
        .mockReturnValueOnce({
          isDirectory: () => false,
          mtimeMs: 2,
          size: 10,
        } as unknown as fs.Stats)

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      vi.mocked(mockWindow.webContents.send).mockClear()

      await vi.advanceTimersByTimeAsync(2000)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        {
          sessionId: 'session-1',
          changes: [{ path: 'src/file.ts', type: 'modified' }],
        },
      )
    })

    it('skips poll if previous is still running', async () => {
      // Create a gitStatus that never resolves
      let resolveHanging: (v: string) => void
      mockGitStatus.mockReturnValue(new Promise((r) => { resolveHanging = r }))

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10) // initial poll starts (hangs)

      mockGitStatus.mockClear()
      await vi.advanceTimersByTimeAsync(2000) // next tick — should skip

      expect(mockGitStatus).not.toHaveBeenCalled()

      // Clean up: resolve the hanging promise so afterEach can clean up
      resolveHanging!('')
      await vi.advanceTimersByTimeAsync(10)
    })

    it('parses added, deleted, and untracked files', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      const status = 'A  new.ts\n D old.ts\n?? untracked.ts\n M changed.ts\n'
      mockGitStatus.mockResolvedValue(status)
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      const call = vi.mocked(mockWindow.webContents.send).mock.calls[0] as unknown[]
      const { changes } = call[1] as { changes: Array<{ path: string; type: string }> }
      expect(changes).toContainEqual({ path: 'new.ts', type: 'added' })
      expect(changes).toContainEqual({ path: 'old.ts', type: 'deleted' })
      expect(changes).toContainEqual({ path: 'untracked.ts', type: 'added' })
      expect(changes).toContainEqual({ path: 'changed.ts', type: 'modified' })
    })

    it('handles git errors gracefully', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      mockGitStatus.mockRejectedValue(new Error('not a git repo'))
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      // No crash, no event sent
      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('reports the branch a watched checkout moved to', async () => {
      const onBranchChanged = vi.fn()
      watcher.setOnBranchChanged(onBranchChanged)

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)
      expect(onBranchChanged).toHaveBeenCalledWith('session-1', 'agent/one')
      onBranchChanged.mockClear()

      // A branch switch on a clean tree leaves git status byte-identical, so the
      // branch must be read on its own — not only when the status changed.
      mockGitBranch.mockResolvedValue('agent/two')
      await vi.advanceTimersByTimeAsync(2000)

      expect(onBranchChanged).toHaveBeenCalledWith('session-1', 'agent/two')
    })

    it('reports a branch only when it changes', async () => {
      const onBranchChanged = vi.fn()
      watcher.setOnBranchChanged(onBranchChanged)

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)
      onBranchChanged.mockClear()

      await vi.advanceTimersByTimeAsync(4000)

      expect(onBranchChanged).not.toHaveBeenCalled()
    })

    it('does not report a detached HEAD as a branch', async () => {
      const onBranchChanged = vi.fn()
      watcher.setOnBranchChanged(onBranchChanged)
      mockGitBranch.mockResolvedValue('HEAD')

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      expect(onBranchChanged).not.toHaveBeenCalled()
    })

    it('still reports file changes when the branch read fails', async () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)
      mockGitBranch.mockRejectedValue(new Error('git rev-parse failed (code 128)'))

      mockGitStatus.mockResolvedValue(' M src/file.ts\n')
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        { sessionId: 'session-1', changes: [{ path: 'src/file.ts', type: 'modified' }] },
      )
    })

    it('stops polling when git cannot spawn', async () => {
      const error = Object.assign(new Error('spawn git ENOENT'), {
        code: 'ENOENT',
        syscall: 'spawn git',
      })
      mockGitStatus.mockRejectedValue(error)

      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)

      mockGitStatus.mockClear()
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockGitStatus).not.toHaveBeenCalled()
    })
  })

  // Several folders are on screen at once, so a tree change has to say which
  // folder it happened in — the renderer reloads the folder by path, and the
  // session id alone can't tell one folder from another.
  describe('files:tree-changed', () => {
    it('names the folder the tree watcher reported', () => {
      let notify: ((sessionId: string, rootPath: string) => void) | null = null
      const treeWatcher = {
        watch: vi.fn(),
        unwatch: vi.fn(async () => {}),
        unwatchAll: vi.fn(async () => {}),
        setOnTreeChanged: vi.fn((fn: (sessionId: string, rootPath: string) => void) => { notify = fn }),
      }
      const watcher = new FileWatcher(mockGitStatus, treeWatcher)
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)

      notify!('session-1', '/repos/alpha')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:tree-changed',
        { sessionId: 'session-1', rootPath: '/repos/alpha' },
      )
    })
  })

  describe('watchAdditionalDir', () => {
    it('starts polling an additional directory', async () => {
      const mockGitStatus = vi.fn().mockResolvedValue('')
      const watcher = new FileWatcher(mockGitStatus)
      watcher.watchAdditionalDir('/extra/dir', 'session-1')

      // Initial poll fires immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGitStatus).toHaveBeenCalledWith('/extra/dir')
    })

    it('sends files:changed with source field', async () => {
      const mockGitStatus = vi.fn().mockResolvedValue('M  file.ts\n')
      const watcher = new FileWatcher(mockGitStatus)
      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
      }
      watcher.setMainWindow(mockWindow as any)
      watcher.watchAdditionalDir('/extra/dir', 'session-1')

      await vi.advanceTimersByTimeAsync(0)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        expect.objectContaining({
          sessionId: 'session-1',
          source: '/extra/dir',
        }),
      )
    })

    it('stops polling a non-git add-dir after the first not-a-git-repository failure', async () => {
      const mockGitStatus = vi.fn<(cwd: string) => Promise<string>>()
        .mockRejectedValue(new Error('fatal: not a git repository'))
      const watcher = new FileWatcher(mockGitStatus)
      watcher.watchAdditionalDir('/plain/folder', 'session-1')

      await vi.advanceTimersByTimeAsync(0) // first poll fails -> disable
      mockGitStatus.mockClear()

      await vi.advanceTimersByTimeAsync(2000)
      expect(mockGitStatus).not.toHaveBeenCalled()
    })

    it('unwatchAll stops additional dir watchers too', async () => {
      const mockGitStatus = vi.fn().mockResolvedValue('')
      const watcher = new FileWatcher(mockGitStatus)
      watcher.watch('/worktree', 'session-1')
      watcher.watchAdditionalDir('/extra/dir', 'session-1')

      await watcher.unwatchAll()
      mockGitStatus.mockClear()

      await vi.advanceTimersByTimeAsync(2000)
      expect(mockGitStatus).not.toHaveBeenCalled()
    })
  })

  describe('unwatch', () => {
    it('stops polling for the path', async () => {
      watcher.watch('/repo/worktree', 'session-1')
      await vi.advanceTimersByTimeAsync(10)
      mockGitStatus.mockClear()

      await watcher.unwatch('/repo/worktree')
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockGitStatus).not.toHaveBeenCalled()
    })

    it('does nothing for unwatched paths', async () => {
      await expect(watcher.unwatch('/not-watched')).resolves.toBeUndefined()
    })
  })

  describe('unwatchAll', () => {
    it('stops all polls', async () => {
      watcher.watch('/repo/wt1', 'session-1')
      watcher.watch('/repo/wt2', 'session-2')
      await vi.advanceTimersByTimeAsync(10)
      mockGitStatus.mockClear()

      await watcher.unwatchAll()
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockGitStatus).not.toHaveBeenCalled()
    })
  })

})
