import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ensureManagedWorktreeGuards } from './managed-worktree'

// Against a real repo, not a mocked gitExec. The mocked suite always stubs an
// *absolute* `--git-path` result, which is the one case that cannot go wrong —
// git only answers absolutely for a linked worktree. For an ordinary repo (a
// home workspace, and every fixture here) it answers with the relative
// `.git/info/exclude`, and a relative path is resolved against process.cwd().
// That is the bug this file pins: the guards must write into the repo they were
// given, wherever the process happens to be sitting.
let repo: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' })
}

function makeRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  return dir
}

beforeEach(() => {
  repo = makeRepo('manifold-exclude-')
})

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true })
})

describe('ensureManagedWorktreeGuards exclude path', () => {
  it('writes into the given repo, not the one the process is sitting in', async () => {
    await ensureManagedWorktreeGuards(repo)

    const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8')
    expect(exclude).toContain('# manifold: managed-worktree excludes start')
    expect(exclude).toContain('/.claude/')
  })

  it('leaves an unrelated repo alone', async () => {
    // The bug wrote the block into whatever repo held process.cwd(); this is
    // that bystander, and it must come through untouched.
    const bystander = makeRepo('manifold-bystander-')
    const bystanderExclude = path.join(bystander, '.git', 'info', 'exclude')
    const before = fs.existsSync(bystanderExclude) ? fs.readFileSync(bystanderExclude, 'utf-8') : ''

    try {
      await ensureManagedWorktreeGuards(repo)

      const after = fs.existsSync(bystanderExclude) ? fs.readFileSync(bystanderExclude, 'utf-8') : ''
      expect(after).toBe(before)
      expect(after).not.toContain('# manifold: managed-worktree excludes start')
    } finally {
      fs.rmSync(bystander, { recursive: true, force: true })
    }
  })

  it('is idempotent — a second call does not duplicate the block', async () => {
    await ensureManagedWorktreeGuards(repo)
    await ensureManagedWorktreeGuards(repo)

    const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8')
    const occurrences = exclude.split('# manifold: managed-worktree excludes start').length - 1
    expect(occurrences).toBe(1)
  })

  it('works for a linked worktree, where git answers with an absolute path', async () => {
    const linked = path.join(os.tmpdir(), `manifold-linked-${process.pid}-${Date.now()}`)
    git(repo, 'worktree', 'add', '-q', linked, '-b', 'feat')

    try {
      await ensureManagedWorktreeGuards(linked)

      // A linked worktree shares the main repo's info/exclude.
      const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8')
      expect(exclude).toContain('# manifold: managed-worktree excludes start')
    } finally {
      git(repo, 'worktree', 'remove', '--force', linked)
    }
  })
})
