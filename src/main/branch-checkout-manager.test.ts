import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
  const child = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout))
    if (stderr) child.stderr.emit('data', Buffer.from(stderr))
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

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string) => p.split('/').pop() || '',
}))

function mockSpawnReturns(stdout: string, exitCode = 0, stderr = ''): void {
  mockSpawn.mockImplementation(() => fakeSpawnResult(stdout, exitCode, stderr))
}

function mockSpawnSequence(
  calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>
): void {
  const queue = [...calls]
  mockSpawn.mockImplementation(() => {
    const next = queue.shift()
    if (!next) return fakeSpawnResult('', 1, 'unexpected spawn call')
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

import { BranchCheckoutManager } from './branch-checkout-manager'

describe('BranchCheckoutManager', () => {
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
        { stdout: '' }, // git fetch --all --prune
        {
          stdout: [
            'refs/heads/main',
            'refs/heads/feature/login',
            'refs/remotes/origin/main',
            'refs/remotes/origin/feature/login',
            'refs/remotes/origin/feature/signup',
          ].join('\n'),
        }, // git branch -a --format=%(refname)
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' }, // git worktree list --porcelain (only main repo)
      ])

      const branches = await manager.listBranches('/repo')

      expect(names(branches)).toContain('main')
      expect(names(branches)).toContain('feature/login')
      expect(names(branches)).toContain('feature/signup')
      // Branches existing both locally and remotely
      expect(findBranch(branches, 'main')?.source).toBe('both')
      expect(findBranch(branches, 'feature/login')?.source).toBe('both')
      // Remote-only branch
      expect(findBranch(branches, 'feature/signup')?.source).toBe('remote')
    })

    it('includes manifold/ branches not checked out in worktrees', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: [
            'refs/heads/main',
            'refs/heads/manifold/oslo',
            'refs/remotes/origin/manifold/bergen',
          ].join('\n'),
        },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' }, // git worktree list --porcelain (only main repo)
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
        {
          stdout: [
            'refs/heads/main',
            'refs/heads/manifold/oslo',
            'refs/remotes/origin/manifold/bergen',
          ].join('\n'),
        },
        {
          stdout: [
            'worktree /repo',
            'branch refs/heads/main',
            '',
            'worktree /home/.manifold/worktrees/proj/manifold-oslo',
            'branch refs/heads/manifold/oslo',
            '',
          ].join('\n'),
        }, // git worktree list --porcelain
      ])

      const branches = await manager.listBranches('/repo')

      expect(names(branches)).toContain('main')
      expect(names(branches)).not.toContain('manifold/oslo')
      expect(names(branches)).toContain('manifold/bergen')
    })

    it('filters out remote HEAD pointers', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: 'refs/heads/main\nrefs/remotes/origin/HEAD\nrefs/remotes/origin/main\n',
        },
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' }, // git worktree list --porcelain (only main repo)
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
        { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' }, // git worktree list --porcelain (only main repo)
      ])

      const branches = await manager.listBranches('/repo')
      expect(names(branches)).toContain('main')
      expect(findBranch(branches, 'main')?.source).toBe('local')
    })

    it('filters out branches currently checked out in worktrees', async () => {
      mockSpawnSequence([
        { stdout: '' }, // git fetch --all --prune
        {
          stdout: [
            'refs/heads/main',
            'refs/heads/feature/login',
            'refs/heads/feature/signup',
          ].join('\n'),
        }, // git branch -a --format=%(refname)
        {
          stdout: [
            'worktree /repo',
            'branch refs/heads/main',
            '',
            'worktree /home/.manifold/worktrees/proj/feature-login',
            'branch refs/heads/feature/login',
            '',
          ].join('\n'),
        }, // git worktree list --porcelain
      ])

      const branches = await manager.listBranches('/repo')

      // feature/login is checked out in a worktree, so excluded
      expect(names(branches)).not.toContain('feature/login')
      // feature/signup is not in a worktree, so included
      expect(names(branches)).toContain('feature/signup')
      // main is the bare repo checkout, not a manifold worktree — keep it available
      expect(names(branches)).toContain('main')
    })
  })

  describe('fetchPRBranch', () => {
    it('fetches PR branch by number', async () => {
      mockSpawnSequence([
        { stdout: 'feature/cool-stuff\n' }, // gh pr view --json headRefName
        { stdout: '' },                      // git fetch origin feature/cool-stuff
      ])

      const branch = await manager.fetchPRBranch('/repo', '42')

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '42', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' })
      )
      expect(branch).toBe('feature/cool-stuff')
    })

    it('extracts PR number from GitHub URL', async () => {
      mockSpawnSequence([
        { stdout: 'fix/bug-123\n' },
        { stdout: '' },
      ])

      const branch = await manager.fetchPRBranch(
        '/repo',
        'https://github.com/org/repo/pull/99'
      )

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '99', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' })
      )
      expect(branch).toBe('fix/bug-123')
    })

    it('throws on invalid PR identifier', async () => {
      await expect(
        manager.fetchPRBranch('/repo', 'not-a-number')
      ).rejects.toThrow('Invalid PR identifier')
    })

    it('throws when gh fails', async () => {
      mockSpawnReturns('', 1, 'Could not resolve to a pull request')

      await expect(
        manager.fetchPRBranch('/repo', '999')
      ).rejects.toThrow()
    })
  })

  describe('createWorktreeFromBranch', () => {
    it('creates a worktree from an existing branch (no -b flag)', async () => {
      mockSpawnReturns('') // git worktree add

      const result = await manager.createWorktreeFromBranch(
        '/repo',
        'feature/login',
        'my-project'
      )

      expect(result.branch).toBe('feature/login')
      expect(result.path).toContain('my-project')
      expect(result.path).toContain('feature-login')
      // Verify no -b flag
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', expect.stringContaining('feature-login'), 'feature/login'],
        expect.objectContaining({ cwd: '/repo' })
      )
    })

    it('creates storage directory if needed', async () => {
      mockSpawnReturns('')

      await manager.createWorktreeFromBranch('/repo', 'main', 'my-project')

      const fs = await import('node:fs')
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('worktrees/my-project'),
        { recursive: true }
      )
    })

    it('handles branch names with slashes in directory naming', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktreeFromBranch(
        '/repo',
        'feature/deep/nested',
        'proj'
      )

      expect(result.path).toContain('feature-deep-nested')
    })
  })
})
