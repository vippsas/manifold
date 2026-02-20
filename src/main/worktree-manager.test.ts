import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('./branch-namer', () => ({
  generateBranchName: vi.fn().mockResolvedValue('manifold/oslo'),
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
    it('creates a worktree with a generated branch name', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktree('/repo', 'main', 'proj-1')

      expect(generateBranchName).toHaveBeenCalledWith('/repo')
      expect(result.branch).toBe('manifold/oslo')
      expect(result.path).toContain('manifold-oslo')
      expect(result.path).toContain('/mock-home/.manifold/worktrees/proj-1/')
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'manifold/oslo', expect.stringContaining('manifold-oslo'), 'main'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    })

    it('uses provided branch name instead of generating one', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'manifold/custom-branch')

      expect(generateBranchName).not.toHaveBeenCalled()
      expect(result.branch).toBe('manifold/custom-branch')
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

      const result = await manager.createWorktree('/repo', 'main', 'proj-1', 'manifold/nested/branch')

      expect(result.path).toContain('manifold-nested-branch')
    })
  })

  describe('removeWorktree', () => {
    it('removes a worktree and deletes the branch', async () => {
      const porcelainOutput =
        'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n'

      // First call: listWorktrees (worktree list --porcelain)
      // Second call: worktree remove
      // Third call: branch -D
      mockSpawnSequence([
        { stdout: porcelainOutput },
        { stdout: '' },
        { stdout: '' },
      ])

      await manager.removeWorktree('/repo', '/repo/.manifold/worktrees/manifold-oslo')

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/repo/.manifold/worktrees/manifold-oslo', '--force'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['branch', '-D', 'manifold/oslo'],
        { cwd: '/repo', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    })

    it('does not throw if branch deletion fails', async () => {
      const porcelainOutput =
        'worktree /repo/.manifold/worktrees/manifold-oslo\nbranch refs/heads/manifold/oslo\n\n'

      mockSpawnSequence([
        { stdout: porcelainOutput },
        { stdout: '' },
        { stdout: '', exitCode: 1, stderr: 'branch not found' },
      ])

      await expect(
        manager.removeWorktree('/repo', '/repo/.manifold/worktrees/manifold-oslo')
      ).resolves.toBeUndefined()
    })
  })

  describe('listWorktrees', () => {
    it('parses porcelain output and filters manifold branches', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /repo/.manifold/worktrees/manifold-oslo',
        'branch refs/heads/manifold/oslo',
        '',
        'worktree /repo/.manifold/worktrees/manifold-bergen',
        'branch refs/heads/manifold/bergen',
        '',
      ].join('\n')

      mockSpawnReturns(porcelain)

      const result = await manager.listWorktrees('/repo')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        branch: 'manifold/oslo',
        path: '/repo/.manifold/worktrees/manifold-oslo',
      })
      expect(result[1]).toEqual({
        branch: 'manifold/bergen',
        path: '/repo/.manifold/worktrees/manifold-bergen',
      })
    })

    it('excludes non-manifold worktrees', async () => {
      const porcelain = [
        'worktree /repo',
        'branch refs/heads/main',
        '',
        'worktree /some/other',
        'branch refs/heads/feature/xyz',
        '',
      ].join('\n')

      mockSpawnReturns(porcelain)

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(0)
    })

    it('handles last entry without trailing blank line', async () => {
      const porcelain = [
        'worktree /repo/.manifold/worktrees/manifold-oslo',
        'branch refs/heads/manifold/oslo',
      ].join('\n')

      mockSpawnReturns(porcelain)

      const result = await manager.listWorktrees('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('manifold/oslo')
    })

    it('returns empty array for empty output', async () => {
      mockSpawnReturns('')

      const result = await manager.listWorktrees('/repo')
      expect(result).toEqual([])
    })
  })
})
