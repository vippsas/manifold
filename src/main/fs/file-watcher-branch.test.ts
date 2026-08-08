import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FileWatcher } from './file-watcher'

// Against a real repo and real git, not a stubbed branch reader: the watcher's
// job here is to notice that the checkout moved under a running agent, which is
// exactly what a mocked branch function cannot prove.
let repo: string
let watcher: FileWatcher

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' })
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a branch report')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-branch-'))
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'test@example.com')
  git(repo, 'config', 'user.name', 'Test')
  fs.writeFileSync(path.join(repo, 'file.txt'), 'x\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-qm', 'init')
  watcher = new FileWatcher()
})

afterEach(async () => {
  await watcher.unwatchAll()
  fs.rmSync(repo, { recursive: true, force: true })
})

describe('FileWatcher branch reporting', () => {
  it('reports the branch the agent cut mid-session', async () => {
    const reported: Array<[string, string]> = []
    watcher.setOnBranchChanged((sessionId, branch) => { reported.push([sessionId, branch]) })

    watcher.watch(repo, 'session-1')
    await waitFor(() => reported.length >= 1, 5000)
    expect(reported[0]).toEqual(['session-1', 'main'])

    git(repo, 'checkout', '-q', '-b', 'fix-the-status-bar')

    await waitFor(() => reported.length >= 2, 8000)
    expect(reported[1]).toEqual(['session-1', 'fix-the-status-bar'])
  }, 20000)
})
