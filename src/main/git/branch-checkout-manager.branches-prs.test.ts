import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
  const emitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const stderrEmitter = new EventEmitter()
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter })

  process.nextTick(() => {
    if (stdout) stdoutEmitter.emit('data', Buffer.from(stdout))
    if (stderr) stderrEmitter.emit('data', Buffer.from(stderr))
    emitter.emit('close', exitCode)
  })

  return emitter as unknown as ChildProcess
}

const { spawn: mockSpawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
const { mockPrepareManagedWorktree } = vi.hoisted(() => ({
  mockPrepareManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}))

vi.mock('./managed-worktree', () => ({
  prepareManagedWorktree: mockPrepareManagedWorktree,
}))

function mockSpawnReturns(stdout: string, exitCode = 0, stderr = ''): void {
  mockSpawn.mockImplementation(() => fakeSpawnResult(stdout, exitCode, stderr))
}

function mockSpawnSequence(calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>): void {
  const queue = [...calls]
  mockSpawn.mockImplementation(() => {
    const next = queue.shift()
    if (!next) return fakeSpawnResult('', 1, 'unexpected spawn call')
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

import { BranchCheckoutManager } from './branch-checkout-manager'

describe('BranchCheckoutManager branch and PR flows', () => {
  let manager: BranchCheckoutManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new BranchCheckoutManager('/mock-home/.manifold')
  })

  describe('listBranches', () => {
    function names(branches: { name: string }[]): string[] {
      return branches.map((b) => b.name)
    }

    function findBranch(branches: { name: string; source: string }[], name: string) {
      return branches.find((b) => b.name === name)
    }

    it('fetches from remote then returns deduplicated branch list with source info', async () => {
      mockSpawnSequence([
        { stdout: '' },
        { stdout: ['refs/heads/main', 'refs/heads/feature/login', 'refs/remotes/origin/main', 'refs/remotes/origin/feature/login', 'refs/remotes/origin/feature/signup'].join('\n') },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).toContain('main')
      expect(names(branches)).toContain('feature/login')
      expect(names(branches)).toContain('feature/signup')
      expect(findBranch(branches, 'main')?.source).toBe('both')
      expect(findBranch(branches, 'feature/login')?.source).toBe('both')
      expect(findBranch(branches, 'feature/signup')?.source).toBe('remote')
    })

    it('includes manifold/ branches not checked out in worktrees', async () => {
      mockSpawnSequence([
        { stdout: '' },
        { stdout: ['refs/heads/main', 'refs/heads/manifold/oslo', 'refs/remotes/origin/manifold/bergen'].join('\n') },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).toContain('main')
      expect(names(branches)).toContain('manifold/oslo')
      expect(findBranch(branches, 'manifold/oslo')?.source).toBe('local')
      expect(names(branches)).toContain('manifold/bergen')
      expect(findBranch(branches, 'manifold/bergen')?.source).toBe('remote')
    })

    it('filters out manifold/ branches checked out in worktrees', async () => {
      mockSpawnSequence([
        { stdout: '' },
        { stdout: ['refs/heads/main', 'refs/heads/manifold/oslo', 'refs/remotes/origin/manifold/bergen'].join('\n') },
        { stdout: ['worktree /repo', 'branch refs/heads/main', '', 'worktree /home/.manifold/worktrees/proj/manifold-oslo', 'branch refs/heads/manifold/oslo', ''].join('\n') },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).toContain('main')
      expect(names(branches)).not.toContain('manifold/oslo')
      expect(names(branches)).toContain('manifold/bergen')
    })

    it('filters out remote HEAD pointers', async () => {
      mockSpawnSequence([
        { stdout: '' },
        { stdout: 'refs/heads/main\nrefs/remotes/origin/HEAD\nrefs/remotes/origin/main\n' },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).not.toContain('HEAD')
      expect(names(branches)).not.toContain('origin')
      expect(names(branches)).toContain('main')
    })

    it('returns local branches when fetch fails', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 128, stderr: 'fatal: no remote' },
        { stdout: 'refs/heads/main\n' },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).toContain('main')
      expect(findBranch(branches, 'main')?.source).toBe('local')
    })

    it('filters out branches currently checked out in worktrees', async () => {
      mockSpawnSequence([
        { stdout: '' },
        { stdout: ['refs/heads/main', 'refs/heads/feature/login', 'refs/heads/feature/signup'].join('\n') },
        { stdout: ['worktree /repo', 'branch refs/heads/main', '', 'worktree /home/.manifold/worktrees/proj/feature-login', 'branch refs/heads/feature/login', ''].join('\n') },
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).not.toContain('feature/login')
      expect(names(branches)).toContain('feature/signup')
      expect(names(branches)).toContain('main')
    })
  })

  describe('fetchPRBranch', () => {
    it('fetches PR branch by number', async () => {
      mockSpawnSequence([{ stdout: 'feature/cool-stuff\n' }, { stdout: '' }])

      const branch = await manager.fetchPRBranch('/repo', '42')
      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '42', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' }),
      )
      expect(branch).toBe('feature/cool-stuff')
    })

    it('extracts PR number from GitHub URL', async () => {
      mockSpawnSequence([{ stdout: 'fix/bug-123\n' }, { stdout: '' }])

      const branch = await manager.fetchPRBranch('/repo', 'https://github.com/org/repo/pull/99')
      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '99', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' }),
      )
      expect(branch).toBe('fix/bug-123')
    })

    it('throws on invalid PR identifier', async () => {
      await expect(manager.fetchPRBranch('/repo', 'not-a-number')).rejects.toThrow('Invalid PR identifier')
    })

    it('throws when gh fails', async () => {
      mockSpawnReturns('', 1, 'Could not resolve to a pull request')
      await expect(manager.fetchPRBranch('/repo', '999')).rejects.toThrow()
    })
  })
})
