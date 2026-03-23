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

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string) => p.split('/').pop() || '',
}))

vi.mock('./managed-worktree', () => ({
  prepareManagedWorktree: mockPrepareManagedWorktree,
}))

function mockSpawnSequence(calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>): void {
  const queue = [...calls]
  mockSpawn.mockImplementation(() => {
    const next = queue.shift()
    if (!next) return fakeSpawnResult('', 1, 'unexpected spawn call')
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

import { BranchCheckoutManager } from './branch-checkout-manager'
import { prepareManagedWorktree } from './managed-worktree'

describe('BranchCheckoutManager worktree creation', () => {
  let manager: BranchCheckoutManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new BranchCheckoutManager('/mock-home/.manifold')
  })

  it('creates a worktree from an existing branch (no -b flag)', async () => {
    mockSpawnSequence([
      { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      { stdout: 'main\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    const result = await manager.createWorktreeFromBranch('/repo', 'feature/login', 'my-project', 'main')
    expect(result.branch).toBe('feature/login')
    expect(result.path).toContain('my-project')
    expect(result.path).toContain('feature-login')
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', expect.stringContaining('feature-login'), 'feature/login'],
      expect.objectContaining({ cwd: '/repo' }),
    )
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['reset', '--mixed', 'HEAD'],
      expect.objectContaining({ cwd: result.path }),
    )
    expect(prepareManagedWorktree).toHaveBeenCalledWith(result.path)
  })

  it('creates storage directory if needed', async () => {
    mockSpawnSequence([
      { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      { stdout: 'main\n' },
      { stdout: '' },
      { stdout: '' },
      { stdout: '' },
    ])

    await manager.createWorktreeFromBranch('/repo', 'main', 'my-project', 'main')
    const fs = await import('node:fs')
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('worktrees/my-project'), { recursive: true })
  })

  it('handles branch names with slashes in directory naming', async () => {
    mockSpawnSequence([
      { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      { stdout: 'main\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    const result = await manager.createWorktreeFromBranch('/repo', 'feature/deep/nested', 'proj', 'main')
    expect(result.path).toContain('feature-deep-nested')
  })

  it('switches main repo to baseBranch when target branch is already checked out', async () => {
    mockSpawnSequence([
      { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      { stdout: 'cloud-platform-decisions/vibe-coding-solution\n' },
      { stdout: '' },
      { stdout: '' },
      { stdout: '' },
    ])

    const result = await manager.createWorktreeFromBranch(
      '/repo',
      'cloud-platform-decisions/vibe-coding-solution',
      'proj',
      'main',
    )

    expect(result.branch).toBe('cloud-platform-decisions/vibe-coding-solution')
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['checkout', 'main'],
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  it('does not switch branch when target is not currently checked out', async () => {
    mockSpawnSequence([
      { stdout: 'worktree /repo\nbranch refs/heads/main\n\n' },
      { stdout: 'main\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    await manager.createWorktreeFromBranch('/repo', 'feature/login', 'proj', 'main')
    expect(mockSpawn).not.toHaveBeenCalledWith('git', ['checkout', 'main'], expect.anything())
  })
})
