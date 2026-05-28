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
import { generateBranchName } from './branch-namer'
import { prepareManagedWorktree } from './managed-worktree'
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
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['reset', '--mixed', 'HEAD'],
        { cwd: result.path, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      expect(prepareManagedWorktree).toHaveBeenCalledWith(result.path)
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
        { stdout: '' },                                                           // reset --mixed HEAD
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
    it('removes a worktree and keeps the branch', async () => {
      mockSpawnSequence([{ stdout: '' }])

      await manager.removeWorktree('/repo', '/repo/.manifold/worktrees/repo-oslo')

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/repo/.manifold/worktrees/repo-oslo', '--force'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('also removes the worktree metadata file', async () => {
      mockSpawnSequence([{ stdout: '' }])
      const { removeWorktreeMeta } = await import('./worktree-meta')

      await manager.removeWorktree('/repo', '/mock-home/.manifold/worktrees/proj/repo-oslo')

      expect(removeWorktreeMeta).toHaveBeenCalledWith(
        '/mock-home/.manifold/worktrees/proj/repo-oslo',
      )
    })

    it('retries with -f -f when the first --force fails (locked worktree)', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 1, stderr: 'fatal: ...is locked...' },
        { stdout: '' },
      ])

      await manager.removeWorktree('/repo', '/mock-home/.manifold/worktrees/proj/repo-oslo')

      expect(mockSpawn).toHaveBeenNthCalledWith(
        2,
        'git',
        ['worktree', 'remove', '--force', '--force', '/mock-home/.manifold/worktrees/proj/repo-oslo'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    })

    it('removes metadata even when git removal fails so discovery does not resurrect the session', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 1, stderr: 'fatal: ...' },
        { stdout: '', exitCode: 1, stderr: 'fatal: ...' },
        { stdout: '' }, // worktree prune
      ])
      const { removeWorktreeMeta } = await import('./worktree-meta')

      await manager.removeWorktree('/repo', '/mock-home/.manifold/worktrees/proj/repo-oslo')

      expect(removeWorktreeMeta).toHaveBeenCalledWith(
        '/mock-home/.manifold/worktrees/proj/repo-oslo',
      )
    })
  })

})
