import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockWatcherClose, mockWatcherOn, mockChokidarWatch } = vi.hoisted(() => {
  const mockWatcherClose = vi.fn().mockResolvedValue(undefined)
  const mockWatcherOn = vi.fn()
  const mockChokidarWatch = vi.fn(() => ({
    close: mockWatcherClose,
    on: mockWatcherOn,
  }))
  return { mockWatcherClose, mockWatcherOn, mockChokidarWatch }
})

vi.mock('chokidar', () => ({
  watch: mockChokidarWatch,
}))

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks()
    watcher = new FileWatcher()
  })

  describe('watch', () => {
    it('creates a chokidar watcher for the path', () => {
      watcher.watch('/repo/worktree', 'session-1')

      expect(mockChokidarWatch).toHaveBeenCalledWith('/repo/worktree', expect.objectContaining({
        persistent: true,
        ignoreInitial: true,
      }))
    })

    it('does not create duplicate watchers for same path', () => {
      watcher.watch('/repo/worktree', 'session-1')
      watcher.watch('/repo/worktree', 'session-1')

      expect(mockChokidarWatch).toHaveBeenCalledTimes(1)
    })

    it('registers add, change, and unlink handlers', () => {
      watcher.watch('/repo/worktree', 'session-1')

      const onCalls = mockWatcherOn.mock.calls.map((c) => c[0])
      expect(onCalls).toContain('add')
      expect(onCalls).toContain('change')
      expect(onCalls).toContain('unlink')
    })

    it('sends file change events to renderer', () => {
      const mockWindow = createMockWindow()
      watcher.setMainWindow(mockWindow)
      watcher.watch('/repo/worktree', 'session-1')

      // Simulate an 'add' event
      const addHandler = mockWatcherOn.mock.calls.find((c) => c[0] === 'add')![1] as (path: string) => void
      addHandler('/repo/worktree/src/file.ts')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'files:changed',
        { sessionId: 'session-1', changes: [{ path: 'src/file.ts', type: 'added' }] },
      )
    })
  })

  describe('unwatch', () => {
    it('closes the watcher and removes it', async () => {
      watcher.watch('/repo/worktree', 'session-1')
      await watcher.unwatch('/repo/worktree')

      expect(mockWatcherClose).toHaveBeenCalled()
    })

    it('does nothing for unwatched paths', async () => {
      await expect(watcher.unwatch('/not-watched')).resolves.toBeUndefined()
    })
  })

  describe('unwatchAll', () => {
    it('closes all watchers', async () => {
      watcher.watch('/repo/wt1', 'session-1')
      watcher.watch('/repo/wt2', 'session-2')

      await watcher.unwatchAll()

      expect(mockWatcherClose).toHaveBeenCalledTimes(2)
    })
  })

  describe('getFileTree', () => {
    it('builds a tree for a directory', () => {
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
      } as unknown as fs.Stats)

      mockReaddirSync.mockReturnValue([
        { name: 'file.ts', isDirectory: () => false },
        { name: 'src', isDirectory: () => true },
      ] as unknown as fs.Dirent[])

      // For recursive calls: src is a dir with no children, file.ts is a file
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats) // root
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats) // src (directories first)
        .mockReturnValueOnce({ isDirectory: () => false } as unknown as fs.Stats) // file.ts

      mockReaddirSync
        .mockReturnValueOnce([
          { name: 'file.ts', isDirectory: () => false },
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[])
        .mockReturnValueOnce([] as unknown as fs.Dirent[]) // src is empty

      const tree = watcher.getFileTree('/repo/worktree')

      expect(tree.name).toBe('worktree')
      expect(tree.isDirectory).toBe(true)
      expect(tree.children).toBeDefined()
    })

    it('filters out hidden files and node_modules', () => {
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
      } as unknown as fs.Stats)

      mockReaddirSync.mockReturnValue([
        { name: '.git', isDirectory: () => true },
        { name: 'node_modules', isDirectory: () => true },
        { name: '.env', isDirectory: () => false },
        { name: 'index.ts', isDirectory: () => false },
      ] as unknown as fs.Dirent[])

      // Only index.ts should be processed
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as unknown as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as unknown as fs.Stats) // index.ts

      mockReaddirSync.mockReturnValueOnce([
        { name: '.git', isDirectory: () => true },
        { name: 'node_modules', isDirectory: () => true },
        { name: '.env', isDirectory: () => false },
        { name: 'index.ts', isDirectory: () => false },
      ] as unknown as fs.Dirent[])

      const tree = watcher.getFileTree('/repo/worktree')
      const childNames = tree.children?.map((c) => c.name) ?? []
      expect(childNames).toContain('index.ts')
      expect(childNames).not.toContain('.git')
      expect(childNames).not.toContain('node_modules')
      expect(childNames).not.toContain('.env')
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
