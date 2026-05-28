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

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  relative: (from: string, to: string) => to.replace(from + '/', ''),
  basename: (p: string) => p.split('/').pop() ?? p,
}))

import * as fs from 'node:fs'
import { FileWatcher } from './file-watcher'

const mockStatSync = vi.mocked(fs.statSync)
const mockReaddirSync = vi.mocked(fs.readdirSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockExistsSync = vi.mocked(fs.existsSync)
const mockRenameSync = vi.mocked(fs.renameSync)
const mockCpSync = vi.mocked(fs.cpSync)

describe('FileWatcher — file operations', () => {
  let watcher: FileWatcher
  let mockGitStatus: ReturnType<typeof vi.fn<(cwd: string) => Promise<string>>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGitStatus = vi.fn<(cwd: string) => Promise<string>>().mockResolvedValue('')
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 1,
      size: 1,
    } as unknown as fs.Stats)
    watcher = new FileWatcher(mockGitStatus)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    vi.useRealTimers()
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
        ] as unknown as ReturnType<typeof fs.readdirSync>)
        .mockReturnValueOnce([] as unknown as ReturnType<typeof fs.readdirSync>)

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
      ] as unknown as ReturnType<typeof fs.readdirSync>)

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

  describe('renameFile', () => {
    it('renames a file successfully', () => {
      mockExistsSync.mockReturnValue(false)

      watcher.renameFile('/repo/old.ts', '/repo/new.ts')

      expect(mockExistsSync).toHaveBeenCalledWith('/repo/new.ts')
      expect(mockRenameSync).toHaveBeenCalledWith('/repo/old.ts', '/repo/new.ts')
    })

    it('throws when target already exists', () => {
      mockExistsSync.mockReturnValue(true)

      expect(() => watcher.renameFile('/repo/old.ts', '/repo/new.ts')).toThrow(
        'Target already exists: /repo/new.ts'
      )
      expect(mockRenameSync).not.toHaveBeenCalled()
    })

    it('propagates rename errors', () => {
      mockExistsSync.mockReturnValue(false)
      mockRenameSync.mockImplementation(() => {
        throw new Error('EPERM')
      })

      expect(() => watcher.renameFile('/repo/old.ts', '/repo/new.ts')).toThrow('EPERM')
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

  describe('createFile', () => {
    it('creates an empty file at the given path', () => {
      watcher.createFile('/repo/worktree/newfile.txt')
      expect(fs.writeFileSync).toHaveBeenCalledWith('/repo/worktree/newfile.txt', '', 'utf-8')
    })

    it('throws if file already exists', () => {
      mockExistsSync.mockReturnValue(true)
      expect(() => watcher.createFile('/repo/worktree/existing.txt')).toThrow('already exists')
    })
  })

  describe('createDir', () => {
    it('creates a directory at the given path', () => {
      mockExistsSync.mockReturnValue(false)
      watcher.createDir('/repo/worktree/newdir')
      expect(fs.mkdirSync).toHaveBeenCalledWith('/repo/worktree/newdir')
    })

    it('throws if directory already exists', () => {
      mockExistsSync.mockReturnValue(true)
      expect(() => watcher.createDir('/repo/worktree/existing')).toThrow('already exists')
    })
  })

  describe('importPaths', () => {
    it('copies dropped files into the target directory', () => {
      mockStatSync.mockImplementation((targetPath: fs.PathLike) => ({
        isDirectory: () => targetPath === '/repo/worktree/imports',
      } as unknown as fs.Stats))
      mockExistsSync.mockReturnValue(false)

      const imported = watcher.importPaths(['/tmp/report.md'], '/repo/worktree/imports')

      expect(imported).toEqual(['/repo/worktree/imports/report.md'])
      expect(mockCpSync).toHaveBeenCalledWith('/tmp/report.md', '/repo/worktree/imports/report.md', {
        recursive: false,
        force: false,
        errorOnExist: true,
      })
    })

    it('copies directories recursively', () => {
      mockStatSync.mockImplementation((targetPath: fs.PathLike) => ({
        isDirectory: () => targetPath === '/repo/worktree/imports' || targetPath === '/tmp/assets',
      } as unknown as fs.Stats))
      mockExistsSync.mockReturnValue(false)

      watcher.importPaths(['/tmp/assets'], '/repo/worktree/imports')

      expect(mockCpSync).toHaveBeenCalledWith('/tmp/assets', '/repo/worktree/imports/assets', {
        recursive: true,
        force: false,
        errorOnExist: true,
      })
    })

    it('fails before copying when a target already exists', () => {
      mockStatSync.mockImplementation((targetPath: fs.PathLike) => ({
        isDirectory: () => targetPath === '/repo/worktree/imports',
      } as unknown as fs.Stats))
      mockExistsSync.mockImplementation((targetPath: fs.PathLike) => targetPath === '/repo/worktree/imports/report.md')

      expect(() => watcher.importPaths(['/tmp/report.md'], '/repo/worktree/imports')).toThrow(
        'Target already exists: /repo/worktree/imports/report.md'
      )
      expect(mockCpSync).not.toHaveBeenCalled()
    })
  })
})
