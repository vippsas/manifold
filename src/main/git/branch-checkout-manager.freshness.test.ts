import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { BranchCheckoutManager } from './branch-checkout-manager'

const run = promisify(execFile)

// Real-git integration tests: the mocked suites verify which commands are
// issued, but the stale-worktree bug (agent spawned on an outdated branch tip
// until a manual `git pull`) was invisible to them. These pin the observable
// behavior against actual repositories.

let tmp: string
let origin: string
let seed: string
let project: string
let manager: BranchCheckoutManager

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd })
  return stdout.trim()
}

async function seedCommit(branch: string, message: string): Promise<string> {
  await git(seed, 'checkout', '-q', branch)
  await git(seed, 'commit', '-q', '--allow-empty', '-m', message)
  await git(seed, 'push', '-q', 'origin', branch)
  return git(seed, 'rev-parse', 'HEAD')
}

beforeEach(async () => {
  // realpath: macOS tmpdir lives behind a /var → /private/var symlink, and
  // `git worktree list` reports resolved paths — keep both sides comparable.
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bcm-freshness-')))
  origin = path.join(tmp, 'origin.git')
  seed = path.join(tmp, 'seed')
  project = path.join(tmp, 'project')

  await fs.mkdir(origin)
  await run('git', ['init', '-q', '--bare'], { cwd: origin })

  await fs.mkdir(seed)
  await run('git', ['init', '-q', '-b', 'main'], { cwd: seed })
  await git(seed, 'config', 'user.email', 't@t.t')
  await git(seed, 'config', 'user.name', 'T')
  await git(seed, 'commit', '-q', '--allow-empty', '-m', 'c0')
  await git(seed, 'remote', 'add', 'origin', origin)
  await git(seed, 'push', '-q', '-u', 'origin', 'main')
  await run('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: origin })

  await run('git', ['clone', '-q', origin, project], { cwd: tmp })
  await git(project, 'config', 'user.email', 't@t.t')
  await git(project, 'config', 'user.name', 'T')

  manager = new BranchCheckoutManager(path.join(tmp, 'manifold-home'))
}, 20_000)

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('BranchCheckoutManager branch freshness (real git)', () => {
  it('fast-forwards a stale local branch so the worktree starts at the origin tip', async () => {
    await git(seed, 'checkout', '-q', '-b', 'feat')
    await seedCommit('feat', 'f1')
    await git(project, 'fetch', '-q', 'origin')
    await git(project, 'branch', 'feat', 'origin/feat')
    const originTip = await seedCommit('feat', 'f2')

    const result = await manager.createWorktreeFromBranch(project, 'feat', 'proj', 'main')

    expect(await git(result.path, 'rev-parse', 'HEAD')).toBe(originTip)
  }, 20_000)

  it('keeps a diverged local branch untouched (never rewrites local work)', async () => {
    await git(seed, 'checkout', '-q', '-b', 'feat')
    await seedCommit('feat', 'f1')
    await git(project, 'fetch', '-q', 'origin')
    await git(project, 'checkout', '-q', 'feat')
    await git(project, 'commit', '-q', '--allow-empty', '-m', 'local-only')
    const localTip = await git(project, 'rev-parse', 'HEAD')
    await git(project, 'checkout', '-q', 'main')
    await seedCommit('feat', 'f2')

    const result = await manager.createWorktreeFromBranch(project, 'feat', 'proj', 'main')

    expect(await git(result.path, 'rev-parse', 'HEAD')).toBe(localTip)
  }, 20_000)

  it('checks out a remote-only branch at the origin tip with upstream tracking', async () => {
    await git(seed, 'checkout', '-q', '-b', 'feat')
    const originTip = await seedCommit('feat', 'f1')
    await git(project, 'fetch', '-q', 'origin')

    const result = await manager.createWorktreeFromBranch(project, 'feat', 'proj', 'main')

    expect(await git(result.path, 'rev-parse', 'HEAD')).toBe(originTip)
    expect(await git(result.path, 'rev-parse', '--abbrev-ref', 'feat@{upstream}')).toBe('origin/feat')
  }, 20_000)

  it('fast-forwards a reused worktree that fell behind origin', async () => {
    await git(seed, 'checkout', '-q', '-b', 'feat')
    await seedCommit('feat', 'f1')
    await git(project, 'fetch', '-q', 'origin')
    const first = await manager.createWorktreeFromBranch(project, 'feat', 'proj', 'main')
    const originTip = await seedCommit('feat', 'f2')

    const second = await manager.createWorktreeFromBranch(project, 'feat', 'proj', 'main')

    expect(second.path).toBe(first.path)
    expect(await git(second.path, 'rev-parse', 'HEAD')).toBe(originTip)
  }, 20_000)
})
