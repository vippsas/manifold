import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
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

/**
 * Creates a fake ChildProcess that emits stdout data and then closes.
 * Data emission is deferred via process.nextTick so callers can attach listeners first.
 */
function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
  const child = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  process.nextTick(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout))
    }
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr))
    }
    child.emit('close', exitCode)
  })

  return child
}

const { spawn: mockSpawn } = vi.hoisted(() => {
  return { spawn: vi.fn() }
})

vi.mock('node:child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}))

import { WorktreeManager } from './worktree-manager'
import { generateBranchName } from './branch-namer'
import { readWorktreeMeta } from './worktree-meta'
import * as fs from 'node:fs'

/**
 * Helper: configure mockSpawn to return a fresh fakeSpawnResult on every call
 * with the given stdout. Useful when a single spawn output is expected.
 */
function mockSpawnReturns(stdout: string, exitCode = 0, stderr = ''): void {
  mockSpawn.mockImplementation(() => fakeSpawnResult(stdout, exitCode, stderr))
}

/**
 * Helper: configure mockSpawn to return a sequence of fakeSpawnResults,
 * one per call, in order.
 */
function mockSpawnSequence(
  calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>
): void {
  const queue = [...calls]
  mockSpawn.mockImplementation(() => {
    const next = queue.shift()
    if (!next) {
      return fakeSpawnResult('', 1, 'unexpected spawn call')
    }
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

describe('WorktreeManager', () => {
  let manager: WorktreeManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorktreeManager('/mock-home/.manifold')
  })

  describe('createWorktree', () => {
    it('creates a worktree with a generated branch name from task description', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', undefined, 'Fix login button')

      expect(generateBranchName).toHaveBeenCalledWith('/repo', 'Fix login button')
      expect(result.branch).toBe('repo/fix-login-button')
      expect(result.path).toContain('repo-fix-login-button')
      expect(result.path).toContain('/mock-home/.manifold/worktrees/proj-1/')
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'repo/fix-login-button', expect.stringContaining('repo-fix-login-button'), 'main'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    })

    it('uses provided branch name instead of generating one', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'repo/custom-branch')

      expect(generateBranchName).not.toHaveBeenCalled()
      expect(result.branch).toBe('repo/custom-branch')
    })

    it('creates the worktree directory', async () => {
      mockSpawnReturns('')

      await manager.createWorktree('/repo', 'main', 'proj-1')

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/mock-home/.manifold/worktrees/proj-1',
        { recursive: true }
      )
    })

    it('replaces slashes in branch name for directory naming', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'repo/nested/branch')

      expect(result.path).toContain('repo-nested-branch')
    })

    it('bootstraps an empty repo with an initial commit before creating worktree', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 128, stderr: 'fatal: invalid reference: main' }, // rev-parse --verify main
        { stdout: '', exitCode: 128, stderr: 'fatal: bad default revision' },    // rev-parse HEAD (empty repo)
        { stdout: '' },                                                           // commit --allow-empty
        { stdout: '' },                                                           // worktree add
      ])

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'repo/oslo')

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '--allow-empty', '-m', 'Initial commit'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      expect(result.branch).toBe('repo/oslo')
    })

    it('throws when baseBranch is missing in a non-empty repo', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 128, stderr: 'fatal: invalid reference: develop' }, // rev-parse --verify develop
        { stdout: 'abc123\n' },                                                      // rev-parse HEAD (has commits)
      ])

      await expect(
        manager.createWorktree('/repo', 'develop', 'proj-1', 'repo/oslo')
      ).rejects.toThrow('Base branch "develop" does not exist')
    })
  })

  describe('removeWorktree', () => {
    it('removes a worktree and deletes repo-prefixed branches', async () => {
      const porcelainOutput =
        'worktree /repo/.manifold/worktrees/repo-oslo\nbranch refs/heads/repo/oslo\n\n'

      // First call: listWorktrees (worktree list --porcelain)
      // Second call: worktree remove
      // Third call: branch -D
      mockSpawnSequence([
        { stdout: porcelainOutput },
        { stdout: '' },
        { stdout: '' },
      ])

      // listWorktrees now checks metadata to include worktrees
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })

      await manager.removeWorktree('/repo', '/repo/.manifold/worktrees/repo-oslo')

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/repo/.manifold/worktrees/repo-oslo', '--force'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['branch', '-D', 'repo/oslo'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    })

    it('does not throw if branch deletion fails', async () => {
      const porcelainOutput =
        'worktree /repo/.manifold/worktrees/repo-oslo\nbranch refs/heads/repo/oslo\n\n'

      mockSpawnSequence([
        { stdout: porcelainOutput },
        { stdout: '' },
        { stdout: '', exitCode: 1, stderr: 'branch not found' },
      ])

      // listWorktrees now checks metadata to include worktrees
      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })

      await expect(
        manager.removeWorktree('/repo', '/repo/.manifold/worktrees/repo-oslo')
      ).resolves.toBeUndefined()
    })

    it('skips branch deletion for non-repo-prefixed branches', async () => {
      const porcelainOutput =
        'worktree /mock-home/.manifold/worktrees/proj/feature-login\nbranch refs/heads/feature/login\n\n'

      const mockReadMeta = vi.mocked(readWorktreeMeta)
      mockSpawnSequence([
        { stdout: porcelainOutput }, // listWorktrees (worktree list --porcelain)
        { stdout: '' },              // worktree remove
      ])
      // metadata exists so listWorktrees includes it
      mockReadMeta.mockResolvedValueOnce({ runtimeId: 'claude' })

      await manager.removeWorktree('/repo', '/mock-home/.manifold/worktrees/proj/feature-login')

      // Should have called worktree remove
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/mock-home/.manifold/worktrees/proj/feature-login', '--force'],
        expect.objectContaining({ cwd: '/repo' })
      )
      // Should NOT have called branch -D (only 2 spawn calls, not 3)
      expect(mockSpawn).toHaveBeenCalledTimes(2)
    })
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
      // Main repo: no metadata
      mockReadMeta.mockResolvedValueOnce(null)
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
