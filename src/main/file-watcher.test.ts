import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  relative: (from: string, to: string) => to.replace(from + '/', ''),
  basename: (p: string) => p.split('/').pop() ?? p,
}))

import * as fs from 'node:fs'
import { FileWatcher } from './file-watcher'
import type { BrowserWindow } from 'electron'

const mockStatSync = vi.mocked(fs.statSync)
const mockReaddirSync = vi.mocked(fs.readdirSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)

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
  let mockGitStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGitStatus = vi.fn().mockResolvedValue('')
    watcher = new FileWatcher(mockGitStatus)
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

      mockWindow.webContents.send.mockClear()

      // Same status on next poll
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
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

      const call = mockWindow.webContents.send.mock.calls[0]
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

  describe('getFileTree', () => {
    it('builds a tree for a directory', () => {
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as unknown as fs.Stats)

      mockReaddirSync
        .mockReturnValueOnce([
          { name: 'file.ts', isDirectory: () => false },
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[])
        .mockReturnValueOnce([] as unknown as fs.Dirent[])

      const tree = watcher.getFileTree('/repo/worktree')

      expect(tree.name).toBe('worktree')
      expect(tree.isDirectory).toBe(true)
      expect(tree.children).toBeDefined()
    })

    it('filters out node_modules and .git directories but shows dotfiles', () => {
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as unknown as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as unknown as fs.Stats)

      mockReaddirSync.mockReturnValueOnce([
        { name: '.git', isDirectory: () => true },
        { name: 'node_modules', isDirectory: () => true },
        { name: '.env', isDirectory: () => false },
        { name: 'index.ts', isDirectory: () => false },
      ] as unknown as fs.Dirent[])

      const tree = watcher.getFileTree('/repo/worktree')
      const childNames = tree.children?.map((c) => c.name) ?? []
      expect(childNames).toContain('index.ts')
      expect(childNames).toContain('.env')
      expect(childNames).not.toContain('.git')
      expect(childNames).not.toContain('node_modules')
    })

    it('returns a file node when path is not a directory', () => {
      mockStatSync.mockReturnValue({
        isDirectory: () => false,
      } as unknown as fs.Stats)

      const tree = watcher.getFileTree('/repo/file.ts')
      expect(tree.isDirectory).toBe(false)
      expect(tree.children).toBeUndefined()
    })

    it('handles statSync errors gracefully', () => {
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const tree = watcher.getFileTree('/repo/missing')
      expect(tree.isDirectory).toBe(false)
    })
  })

  describe('readFile', () => {
    it('reads file contents', () => {
      mockReadFileSync.mockReturnValue('file content')

      const content = watcher.readFile('/repo/file.ts')
      expect(content).toBe('file content')
      expect(mockReadFileSync).toHaveBeenCalledWith('/repo/file.ts', 'utf-8')
    })

    it('throws a descriptive error on failure', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(() => watcher.readFile('/repo/missing.ts')).toThrow(
        'Failed to read file /repo/missing.ts',
      )
    })
  })
})
