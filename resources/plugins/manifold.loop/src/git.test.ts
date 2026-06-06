import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createGitAdapter } from './git'

const run = promisify(execFile)
let wt: string

beforeEach(async () => {
  wt = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-git-'))
  await run('git', ['init', '-q'], { cwd: wt })
  await run('git', ['config', 'user.email', 't@t.t'], { cwd: wt })
  await run('git', ['config', 'user.name', 'T'], { cwd: wt })
  await fs.writeFile(path.join(wt, 'a.txt'), 'one\n')
  await run('git', ['add', '-A'], { cwd: wt })
  await run('git', ['commit', '-qm', 'init'], { cwd: wt })
})
afterEach(async () => { await fs.rm(wt, { recursive: true, force: true }) })

describe('createGitAdapter', () => {
  const git = createGitAdapter()

  it('getHeadSha returns the current HEAD', async () => {
    const sha = await git.getHeadSha(wt)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('getChangedFilesCount counts uncommitted changes', async () => {
    expect(await git.getChangedFilesCount(wt)).toBe(0)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    expect(await git.getChangedFilesCount(wt)).toBe(1)
  })

  it('stageAllAndCommit commits and returns the new sha', async () => {
    const before = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    const sha = await git.stageAllAndCommit(wt, 'add b')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(sha).not.toBe(before)
    expect(await git.getChangedFilesCount(wt)).toBe(0)
  })

  it('hardReset restores a previous sha and cleans new files', async () => {
    const base = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    await git.stageAllAndCommit(wt, 'add b')
    await git.hardReset(wt, base)
    expect(await git.getHeadSha(wt)).toBe(base)
    await expect(fs.stat(path.join(wt, 'b.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('getDiff returns a diff since a sha', async () => {
    const base = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'a.txt'), 'one\ntwo\n')
    await git.stageAllAndCommit(wt, 'edit a')
    const diff = await git.getDiff(wt, base)
    expect(diff).toContain('a.txt')
    expect(diff).toContain('+two')
  })
})
