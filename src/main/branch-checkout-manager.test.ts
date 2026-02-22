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
    it('fetches from remote then returns deduplicated branch list', async () => {
      mockSpawnSequence([
        { stdout: '' }, // git fetch --all --prune
        {
          stdout: [
            '  main',
            '  feature/login',
            '  origin/main',
            '  origin/feature/login',
            '  origin/feature/signup',
          ].join('\n'),
        }, // git branch -a --format=%(refname:short)
      ])

      const branches = await manager.listBranches('/repo')

      expect(branches).toContain('main')
      expect(branches).toContain('feature/login')
      expect(branches).toContain('feature/signup')
      expect(branches.every((b) => !b.startsWith('origin/'))).toBe(true)
    })

    it('filters out manifold/ prefixed branches', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: [
            '  main',
            '  manifold/oslo',
            '  origin/manifold/bergen',
          ].join('\n'),
        },
      ])

      const branches = await manager.listBranches('/repo')

      expect(branches).toContain('main')
      expect(branches).not.toContain('manifold/oslo')
      expect(branches).not.toContain('manifold/bergen')
    })

    it('filters out HEAD entries', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: '  main\n  origin/HEAD\n  origin/main\n',
        },
      ])

      const branches = await manager.listBranches('/repo')

      expect(branches).not.toContain('HEAD')
      expect(branches).toContain('main')
    })

    it('returns local branches when fetch fails', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 128, stderr: 'fatal: no remote' },
        { stdout: '  main\n' },
      ])

      const branches = await manager.listBranches('/repo')
      expect(branches).toContain('main')
    })
  })
})
