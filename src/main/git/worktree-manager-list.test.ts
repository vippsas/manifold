import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../app/debug-log', () => ({
  debugLog: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string) => p.split('/').pop() || '',
}))

vi.mock('./branch-namer', () => ({
  generateBranchName: vi.fn().mockResolvedValue('repo/fix-login-button'),
  repoPrefix: (repoPath: string) => (repoPath.split('/').pop() || '').toLowerCase() + '/',
}))

vi.mock('./worktree-meta', () => ({
  readWorktreeMeta: vi.fn().mockResolvedValue(null),
  removeWorktreeMeta: vi.fn().mockResolvedValue(undefined),
}))

const { mockPrepareManagedWorktree } = vi.hoisted(() => ({
  mockPrepareManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./managed-worktree', () => ({
  prepareManagedWorktree: mockPrepareManagedWorktree,
}))

/**
 * Creates a fake ChildProcess that emits stdout data and then closes.
 * Data emission is deferred via process.nextTick so callers can attach listeners first.
 */
function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
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

const { spawn: mockSpawn } = vi.hoisted(() => {
  return { spawn: vi.fn() }
})

vi.mock('node:child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}))

import { WorktreeManager } from './worktree-manager'
import { readWorktreeMeta } from './worktree-meta'

/**
 * Helper: configure mockSpawn to return a fresh fakeSpawnResult on every call
 * with the given stdout. Useful when a single spawn output is expected.
 */
function mockSpawnReturns(stdout: string, exitCode = 0, stderr = ''): void {
  mockSpawn.mockImplementation(() => fakeSpawnResult(stdout, exitCode, stderr))
}

describe('WorktreeManager — listWorktrees', () => {
  let manager: WorktreeManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readWorktreeMeta).mockReset()
    vi.mocked(readWorktreeMeta).mockResolvedValue(null)
    manager = new WorktreeManager('/mock-home/.manifold')
  })

  describe('listWorktrees', () => {
    it('includes worktrees that have metadata files', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /mock-home/.manifold/worktrees/proj/repo-oslo',
        'branch refs/heads/repo/oslo',
        '',
        'worktree /mock-home/.manifold/worktrees/proj/feature-login',
        'branch refs/heads/feature/login',
        '',
      ].join('\n')

      mockSpawnReturns(porcelain)
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      // repo/oslo worktree: has metadata
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })
      // feature/login worktree: has metadata
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })

      const result = await manager.listWorktrees('/repo')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        branch: 'repo/oslo',
        path: '/mock-home/.manifold/worktrees/proj/repo-oslo',
      })
      expect(result[1]).toEqual({
        branch: 'feature/login',
        path: '/mock-home/.manifold/worktrees/proj/feature-login',
      })
    })

    it('excludes the main project checkout even when it has metadata', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/feature/no-worktree',
        '',
        'worktree /mock-home/.manifold/worktrees/proj/repo-oslo',
        'branch refs/heads/repo/oslo',
        '',
      ].join('\n')

      mockSpawnReturns(porcelain)
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'codex', displayName: 'No-worktree agent' })

      const result = await manager.listWorktrees('/repo')

      expect(result).toEqual([{
        branch: 'repo/oslo',
        path: '/mock-home/.manifold/worktrees/proj/repo-oslo',
      }])
      expect(mockReadMeta).toHaveBeenCalledTimes(1)
      expect(mockReadMeta).toHaveBeenCalledWith('/mock-home/.manifold/worktrees/proj/repo-oslo')
    })

    it('excludes worktrees without metadata files', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /some/other',
        'branch refs/heads/feature/xyz',
        '',
      ].join('\n')

      mockSpawnReturns(porcelain)
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockReadMeta.mockResolvedValue(null)

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(0)
    })

    it('handles last entry without trailing blank line', async () => {
      const porcelain = [
        'worktree /mock-home/.manifold/worktrees/proj/repo-oslo',
        'branch refs/heads/repo/oslo',
      ].join('\n')

      mockSpawnReturns(porcelain)
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('repo/oslo')
    })

    it('returns empty array for empty output', async () => {
      mockSpawnReturns('')

      const result = await manager.listWorktrees('/repo')
      expect(result).toEqual([])
    })
  })
})
