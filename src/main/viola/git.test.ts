import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createViolaGit } from './git'

const repos: string[] = []

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
}

function seedRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'viola-git-'))
  repos.push(root)
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'viola@test')
  git(root, 'config', 'user.name', 'viola')
  writeFileSync(join(root, 'a.txt'), 'one\n')
  git(root, 'add', 'a.txt')
  git(root, 'commit', '-q', '-m', 'base')
  return root
}

afterEach(() => {
  for (const root of repos.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('createViolaGit', () => {
  it('captures a worker diff against its base and applies it onto a clean reviewer worktree', async () => {
    const implementer = seedRepo()
    const reviewer = seedRepo()
    const viola = createViolaGit()
    const baseSha = await viola.head(implementer)
    writeFileSync(join(implementer, 'a.txt'), 'one\ntwo\n')
    git(implementer, 'commit', '-q', '-am', 'change')

    const diff = await viola.diff(implementer, baseSha)
    expect(diff).toContain('+two')
    expect(await viola.diffStat(implementer, baseSha)).toContain('a.txt')

    writeFileSync(join(reviewer, 'a.txt'), 'stale reviewer edit\n')
    writeFileSync(join(reviewer, 'junk.txt'), 'left over\n')
    await viola.apply(reviewer, diff)

    expect(readFileSync(join(reviewer, 'a.txt'), 'utf8')).toBe('one\ntwo\n')
    expect(() => readFileSync(join(reviewer, 'junk.txt'))).toThrow()
  })

  it('fails loudly when the diff does not apply', async () => {
    const reviewer = seedRepo()
    const diff = 'diff --git a/missing.txt b/missing.txt\n--- a/missing.txt\n+++ b/missing.txt\n@@ -1 +1 @@\n-nope\n+yes\n'
    await expect(createViolaGit().apply(reviewer, diff)).rejects.toThrow(/Could not apply the worker's diff/)
  })
})
