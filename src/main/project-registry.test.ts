// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
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
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdio = ['ignore', child.stdout, child.stderr]

  // Emit data and close on next tick so the promise in gitExec can attach listeners first
  process.nextTick(() => {
    child.stdout.emit('data', Buffer.from(stdout))
    child.emit('close', exitCode)
  })

  return child
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
    mockUuidv4.mockReturnValue('test-uuid-1' as ReturnType<typeof uuidv4>)
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
  })

  describe('addProject', () => {
    it('adds a new project and persists to disk', async () => {
      mockExistsSync.mockReturnValue(false)
      // git branch -a --format=... returns 'main'
      setupGitMock([{ stdout: 'main\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')

      expect(project.id).toBe('test-uuid-1')
      expect(project.name).toBe('my-project')
      expect(project.path).toBe('/my-project')
      expect(project.baseBranch).toBe('main')
      expect(project.addedAt).toBeTruthy()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('detects master as base branch when main is absent', async () => {
      mockExistsSync.mockReturnValue(false)
      // git branch -a --format=... returns only 'master' (no 'main')
      setupGitMock([{ stdout: 'master\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('master')
    })

    it('falls back to current branch when neither main nor master exist', async () => {
      mockExistsSync.mockReturnValue(false)
      // First call: git branch -a --format=... returns only 'develop' (no main or master)
      // Second call: git branch --show-current returns 'develop'
      setupGitMock([
        { stdout: 'develop\n' },
        { stdout: 'develop\n' },
      ])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('develop')
    })

    it('falls back to main when git throws', async () => {
      mockExistsSync.mockReturnValue(false)
      // git branch -a fails with non-zero exit code
      setupGitMock([{ stdout: '', exitCode: 128 }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('main')
    })

    it('falls back to main when spawn emits error', async () => {
      mockExistsSync.mockReturnValue(false)
      mockSpawn.mockImplementation(() => {
        const child = new EventEmitter() as any
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.stdio = ['ignore', child.stdout, child.stderr]
        process.nextTick(() => {
          child.emit('error', new Error('spawn ENOENT'))
        })
        return child
      })

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      expect(project.baseBranch).toBe('main')
    })

    it('returns existing project when path already registered (deduplication)', async () => {
      mockExistsSync.mockReturnValue(false)
      // git branch -a --format=... returns 'main'
      setupGitMock([{ stdout: 'main\n' }])
      mockUuidv4.mockReturnValueOnce('id-1' as ReturnType<typeof uuidv4>)

      const registry = new ProjectRegistry()
      const first = await registry.addProject('/my-project')
      const second = await registry.addProject('/my-project')

      expect(first).toEqual(second)
      expect(registry.listProjects()).toHaveLength(1)
    })
  })

  describe('removeProject', () => {
    it('removes a project by id and persists', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: 'main\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')

      const result = registry.removeProject(project.id)
      expect(result).toBe(true)
      expect(registry.listProjects()).toHaveLength(0)
    })

    it('returns false when removing a non-existent id', () => {
      mockExistsSync.mockReturnValue(false)
      const registry = new ProjectRegistry()

      const result = registry.removeProject('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('getProject', () => {
    it('retrieves a project by id', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: 'main\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')

      const found = registry.getProject(project.id)
      expect(found).toBeDefined()
      expect(found!.path).toBe('/my-project')
    })

    it('returns undefined for unknown id', () => {
      mockExistsSync.mockReturnValue(false)
      const registry = new ProjectRegistry()

      expect(registry.getProject('nope')).toBeUndefined()
    })
  })
})
