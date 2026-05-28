// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

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
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockUuidv4 = vi.mocked(uuidv4)
const mockSpawn = vi.mocked(spawn)

/**
 * Creates a fake ChildProcess that emits stdout data and then closes.
 */
function fakeSpawn(stdout: string, exitCode = 0) {
  const emitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const stderrEmitter = new EventEmitter()
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter })

  process.nextTick(() => {
    stdoutEmitter.emit('data', Buffer.from(stdout))
    emitter.emit('close', exitCode)
  })

  return emitter as unknown as ChildProcess
}

/** Sets up mockSpawn to return specific outputs for sequential git calls. */
function setupGitMock(calls: Array<{ stdout: string; exitCode?: number }>) {
  let callIndex = 0
  mockSpawn.mockImplementation(() => {
    const call = calls[callIndex++] ?? { stdout: '', exitCode: 0 }
    return fakeSpawn(call.stdout, call.exitCode ?? 0)
  })
}

describe('ProjectRegistry — mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUuidv4.mockReturnValue('test-uuid-1' as unknown as ReturnType<typeof uuidv4>)
  })

  describe('removeProject', () => {
    it('removes a project by id and persists', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([
        { stdout: 'true\n' },
        { stdout: 'main\n' },
      ])

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

  describe('updateProject', () => {
    it('updates a project and persists to disk', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: 'main\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')
      mockWriteFileSync.mockClear()

      const updated = registry.updateProject(project.id, { baseBranch: 'develop' })

      expect(updated).toBeDefined()
      expect(updated!.baseBranch).toBe('develop')
      expect(updated!.id).toBe(project.id)
      expect(updated!.path).toBe('/my-project')
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('returns undefined for unknown id', () => {
      mockExistsSync.mockReturnValue(false)
      const registry = new ProjectRegistry()

      const result = registry.updateProject('non-existent', { baseBranch: 'develop' })
      expect(result).toBeUndefined()
    })

    it('returns a copy, not the internal reference', async () => {
      mockExistsSync.mockReturnValue(false)
      setupGitMock([{ stdout: 'main\n' }])

      const registry = new ProjectRegistry()
      const project = await registry.addProject('/my-project')

      const updated = registry.updateProject(project.id, { baseBranch: 'develop' })
      const stored = registry.getProject(project.id)

      expect(updated).toEqual(stored)
      expect(updated).not.toBe(stored)
    })
  })
})
