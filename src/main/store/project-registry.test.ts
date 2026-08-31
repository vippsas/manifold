// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  realpathSync: vi.fn((p: string) => p),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  resolve: (p: string) => p,
  basename: (p: string) => p.split('/').pop() ?? p,
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

vi.mock('uuid', () => ({
  v4: vi.fn(),
}))

vi.mock('node:child_process', () => {
  return {
    default: {},
    spawn: vi.fn(),
  }
})

import * as fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { spawn } from 'node:child_process'
import { ProjectRegistry } from './project-registry'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockUuidv4 = vi.mocked(uuidv4)
const mockSpawn = vi.mocked(spawn)

/**
 * Creates a fake ChildProcess that emits stdout data and then closes.
 * `stdout` is the string output the fake git command should produce.
 * `exitCode` defaults to 0 (success).
 */
function fakeSpawn(stdout: string, exitCode = 0) {
  const emitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const stderrEmitter = new EventEmitter()
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter })

  // Emit data and close on next tick so the promise in gitExec can attach listeners first
  process.nextTick(() => {
    stdoutEmitter.emit('data', Buffer.from(stdout))
    emitter.emit('close', exitCode)
  })

  return emitter as unknown as ChildProcess
}

/**
 * Sets up mockSpawn to return specific outputs for sequential git calls.
 * Each entry in `calls` is { stdout, exitCode? }.
 */
function setupGitMock(calls: Array<{ stdout: string; exitCode?: number }>) {
  let callIndex = 0
  mockSpawn.mockImplementation(() => {
    const call = calls[callIndex++] ?? { stdout: '', exitCode: 0 }
    return fakeSpawn(call.stdout, call.exitCode ?? 0)
  })
}

describe('ProjectRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUuidv4.mockReturnValue('test-uuid-1' as unknown as ReturnType<typeof uuidv4>)
  })

  describe('constructor / loadFromDisk', () => {
    it('initializes with empty list when no file exists', () => {
      mockExistsSync.mockReturnValue(false)
      const registry = new ProjectRegistry()
      expect(registry.listProjects()).toEqual([])
    })

    it('loads projects from disk', () => {
      const projects = [
        { id: '1', name: 'foo', path: '/foo', baseBranch: 'main', addedAt: '2024-01-01' },
      ]
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))

      const registry = new ProjectRegistry()
      expect(registry.listProjects()).toEqual(projects)
    })

    it('returns empty list when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json')

      const registry = new ProjectRegistry()
      expect(registry.listProjects()).toEqual([])
    })

    it('returns empty list when file contains a non-array', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ notAnArray: true }))

      const registry = new ProjectRegistry()
      expect(registry.listProjects()).toEqual([])
    })
  })

  describe('listProjects', () => {
    it('returns a copy of the projects array', () => {
      mockExistsSync.mockReturnValue(false)
      const registry = new ProjectRegistry()
      const a = registry.listProjects()
      const b = registry.listProjects()
      expect(a).not.toBe(b)
    })

    it('returns projects sorted alphabetically by name', () => {
      const projects = [
        { id: '2', name: 'zeta', path: '/zeta', baseBranch: 'main', addedAt: '2024-01-02' },
        { id: '1', name: 'alpha', path: '/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
      ]
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))

      const registry = new ProjectRegistry()
      expect(registry.listProjects().map((project) => project.name)).toEqual(['alpha', 'zeta'])
    })
  })

  describe('addProject', () => {
    it('adds a new project and persists to disk', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: '/my-project\n' },
        { stdout: 'main\n' },
      ])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')

      expect(project.id).toBe('test-uuid-1')
      expect(project.name).toBe('my-project')
      expect(project.path).toBe('/my-project')
      expect(project.baseBranch).toBe('main')
      expect(project.kind).toBe('git')
      expect(project.addedAt).toBeTruthy()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('keeps the stored project list alphabetized after adding', async () => {
      const projects = [
        { id: '1', name: 'zeta', path: '/zeta', baseBranch: 'main', addedAt: '2024-01-01' },
      ]
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))
      setupGitMock([
        { stdout: '/alpha\n' },
        { stdout: 'main\n' },
      ])

      const registry = new ProjectRegistry()
      await registry.addProject('/alpha')

      expect(registry.listProjects().map((project) => project.name)).toEqual(['alpha', 'zeta'])
    })

    it('detects master as base branch when main is absent', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: '/my-project\n' },
        { stdout: 'master\n' },
      ])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('master')
    })

    it('falls back to current branch when neither main nor master exist', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: '/my-project\n' },
        { stdout: 'develop\n' },
        { stdout: 'develop\n' },
      ])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('develop')
    })

    it('falls back to main when branch detection throws inside a git repository', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: '/my-project\n' },
        { stdout: '', exitCode: 128 },
      ])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('main')
      expect(project.kind).toBe('git')
    })

    // A subfolder of a clone answers every `git rev-parse` the top of one does.
    // Registered as a repo it would carry the enclosing repo's base branch and
    // cut a worktree of that whole repo under the subfolder's name.
    it('stores a folder inside a git repository as a plain folder', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: '/my-project\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project/src/components/widget')

      expect(project.kind).toBe('folder')
      expect(project.baseBranch).toBe('')
      expect(project.name).toBe('widget')
    })

    it('stores a plain folder when the git probe fails', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: '', exitCode: 128 }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('')
      expect(project.kind).toBe('folder')
    })

    it('stores a forced plain folder without probing git', async () => {
      mockExistsSync.mockReturnValue(false)

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project', { kind: 'folder' })

      expect(project.baseBranch).toBe('')
      expect(project.kind).toBe('folder')
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('stores a plain folder when the git probe cannot spawn', async () => {
      mockExistsSync.mockReturnValue(false)
      mockSpawn.mockImplementation(() => {
        const emitter = new EventEmitter()
        Object.assign(emitter, { stdout: new EventEmitter(), stderr: new EventEmitter() })
        process.nextTick(() => {
          emitter.emit('error', new Error('spawn ENOENT'))
        })
        return emitter as unknown as ChildProcess
      })

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('')
      expect(project.kind).toBe('folder')
    })

    it('returns existing project when path already registered (deduplication)', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: '/my-project\n' },
        { stdout: 'main\n' },
      ])
      mockUuidv4.mockReturnValueOnce('id-1' as unknown as ReturnType<typeof uuidv4>)

      const registry = new ProjectRegistry()
      const first = await registry.addProject('/my-project')
      const second = await registry.addProject('/my-project')

      expect(first).toEqual(second)
      expect(registry.listProjects()).toHaveLength(1)
    })

    it('two concurrent adds for the same path produce a single entry (#528)', async () => {
      mockExistsSync.mockReturnValue(false)
      // Force the git probe to fail so each add resolves to a plain folder after
      // one awaited (and therefore interleavable) git exec.
      mockSpawn.mockImplementation(() => {
        const emitter = new EventEmitter()
        Object.assign(emitter, { stdout: new EventEmitter(), stderr: new EventEmitter() })
        process.nextTick(() => emitter.emit('error', new Error('spawn ENOENT')))
        return emitter as unknown as ChildProcess
      })
      mockUuidv4
        .mockReturnValueOnce('id-a' as unknown as ReturnType<typeof uuidv4>)
        .mockReturnValueOnce('id-b' as unknown as ReturnType<typeof uuidv4>)

      const registry = new ProjectRegistry()
      const [a, b] = await Promise.all([
        registry.addProject('/race'),
        registry.addProject('/race'),
      ])

      // Exactly one entry, and both callers see the same project (no duplicate id).
      expect(registry.listProjects()).toHaveLength(1)
      expect(a.path).toBe('/race')
      expect(a.id).toBe(b.id)
    })
  })

})
