import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  commitManagedWorktreeIndex,
  discardManagedWorktreePaths,
  stageManagedWorktreePaths,
  unstageManagedWorktreePaths,
} from './managed-worktree'
import { parseWorkspaceStatus } from './porcelain-status'

// Against a real repo rather than a mocked gitExec: the whole point of these
// helpers is which git invocation they choose, and a mock would happily accept
// a wrong flag. Cheap — one tiny repo per test.
let repo: string

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })
}

function groups(): { staged: string[]; unstaged: string[] } {
  const { staged, unstaged } = parseWorkspaceStatus(git('status', '--porcelain'))
  return { staged: staged.map((c) => c.path), unstaged: unstaged.map((c) => c.path) }
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-staging-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(repo, 'src'))
  fs.writeFileSync(path.join(repo, 'src/tracked.ts'), 'original\n')
  fs.writeFileSync(path.join(repo, 'src/other.ts'), 'other\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
})

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true })
})

describe('stage/unstage', () => {
  it('moves only the named paths into the index', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'edit\n')
    fs.appendFileSync(path.join(repo, 'src/other.ts'), 'edit\n')

    await stageManagedWorktreePaths(repo, ['src/tracked.ts'])

    expect(groups()).toEqual({ staged: ['src/tracked.ts'], unstaged: ['src/other.ts'] })
  })

  it('stages an untracked file', async () => {
    fs.writeFileSync(path.join(repo, 'src/new.ts'), 'new\n')

    await stageManagedWorktreePaths(repo, ['src/new.ts'])

    expect(groups()).toEqual({ staged: ['src/new.ts'], unstaged: [] })
  })

  it('returns a staged file to the working tree without losing the edit', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'edit\n')
    await stageManagedWorktreePaths(repo, ['src/tracked.ts'])

    await unstageManagedWorktreePaths(repo, ['src/tracked.ts'])

    expect(groups()).toEqual({ staged: [], unstaged: ['src/tracked.ts'] })
    expect(fs.readFileSync(path.join(repo, 'src/tracked.ts'), 'utf-8')).toBe('original\nedit\n')
  })

  it('does nothing for an empty path list', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'edit\n')

    await stageManagedWorktreePaths(repo, [])

    expect(groups()).toEqual({ staged: [], unstaged: ['src/tracked.ts'] })
  })
})

describe('discard', () => {
  it('reverts a tracked file to the committed content', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'edit\n')

    await discardManagedWorktreePaths(repo, ['src/tracked.ts'])

    expect(fs.readFileSync(path.join(repo, 'src/tracked.ts'), 'utf-8')).toBe('original\n')
    expect(groups()).toEqual({ staged: [], unstaged: [] })
  })

  it('deletes an untracked file', async () => {
    fs.writeFileSync(path.join(repo, 'src/new.ts'), 'new\n')

    await discardManagedWorktreePaths(repo, ['src/new.ts'])

    expect(fs.existsSync(path.join(repo, 'src/new.ts'))).toBe(false)
  })

  it('restores a deleted file', async () => {
    fs.rmSync(path.join(repo, 'src/tracked.ts'))

    await discardManagedWorktreePaths(repo, ['src/tracked.ts'])

    expect(fs.readFileSync(path.join(repo, 'src/tracked.ts'), 'utf-8')).toBe('original\n')
  })

  // The staged half is a separate decision from the unstaged half; discarding
  // the working-tree edit must not silently unstage what was already staged.
  it('keeps the staged half of a staged-then-edited file', async () => {
    fs.writeFileSync(path.join(repo, 'src/tracked.ts'), 'staged\n')
    await stageManagedWorktreePaths(repo, ['src/tracked.ts'])
    fs.writeFileSync(path.join(repo, 'src/tracked.ts'), 'staged\nunstaged\n')

    await discardManagedWorktreePaths(repo, ['src/tracked.ts'])

    expect(fs.readFileSync(path.join(repo, 'src/tracked.ts'), 'utf-8')).toBe('staged\n')
    expect(groups()).toEqual({ staged: ['src/tracked.ts'], unstaged: [] })
  })

  it('handles a tracked and an untracked path in one call', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'edit\n')
    fs.writeFileSync(path.join(repo, 'src/new.ts'), 'new\n')

    await discardManagedWorktreePaths(repo, ['src/tracked.ts', 'src/new.ts'])

    expect(fs.readFileSync(path.join(repo, 'src/tracked.ts'), 'utf-8')).toBe('original\n')
    expect(fs.existsSync(path.join(repo, 'src/new.ts'))).toBe(false)
  })
})

describe('commitManagedWorktreeIndex', () => {
  it('commits the index and leaves unstaged work alone', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'staged\n')
    await stageManagedWorktreePaths(repo, ['src/tracked.ts'])
    fs.appendFileSync(path.join(repo, 'src/other.ts'), 'left behind\n')

    await commitManagedWorktreeIndex(repo, 'only the index')

    expect(git('log', '-1', '--pretty=%s').trim()).toBe('only the index')
    expect(groups()).toEqual({ staged: [], unstaged: ['src/other.ts'] })
  })

  it('does not pick up untracked files the way add -A would', async () => {
    fs.appendFileSync(path.join(repo, 'src/tracked.ts'), 'staged\n')
    await stageManagedWorktreePaths(repo, ['src/tracked.ts'])
    fs.writeFileSync(path.join(repo, 'src/scratch.ts'), 'scratch\n')

    await commitManagedWorktreeIndex(repo, 'index only')

    expect(git('show', '--name-only', '--pretty=', 'HEAD').trim()).toBe('src/tracked.ts')
    expect(groups().unstaged).toEqual(['src/scratch.ts'])
  })
})
