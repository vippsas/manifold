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

vi.mock('node:path', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:path')>(),
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

  describe('branch updates', () => {
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

  })

  describe('watchAdditionalDir', () => {
    it('starts polling an additional directory', async () => {
      const mockGitStatus = vi.fn().mockResolvedValue('')
      const watcher = new FileWatcher(mockGitStatus)
      watcher.watchAdditionalDir('/extra/dir', 'session-1')

      // Initial poll fires immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGitStatus).toHaveBeenCalledWith('/extra/dir')
      await watcher.unwatchAll()
    })

    it('sends files:changed with source field', async () => {
      const mockGitStatus = vi.fn().mockResolvedValue('M  file.ts\n')
      const watcher = new FileWatcher(mockGitStatus)
      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
      }
      watcher.setMainWindow(mockWindow as unknown as BrowserWindow)
      watcher.watchAdditionalDir('/extra/dir', 'session-1')

      await vi.advanceTimersByTimeAsync(0)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        expect.objectContaining({
          sessionId: 'session-1',
          source: '/extra/dir',
        }),
      )
      await watcher.unwatchAll()
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
      await watcher.unwatchAll()
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

      watcher.watch('/repos/alpha', 'session-1')
      notify!('session-1', '/repos/alpha')
      void watcher.unwatchAll()

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:tree-changed',
        { sessionId: 'session-1', rootPath: '/repos/alpha' },
      )
    })
  })

})
