import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const DIFF_MAX_BUFFER = 10 * 1024 * 1024

export interface ViolaGit {
  head(worktreePath: string): Promise<string>
  diff(worktreePath: string, baseSha: string): Promise<string>
  diffStat(worktreePath: string, baseSha: string): Promise<string>
  /** Resets a Viola-owned scratch worktree to HEAD, then applies `diff` as uncommitted changes.
   *  Only ever pointed at reviewer worktrees Viola created itself. */
  apply(worktreePath: string, diff: string): Promise<void>
  pullRequestUrl(worktreePath: string): Promise<string | undefined>
}

export function createViolaGit(): ViolaGit {
  return {
    async head(worktreePath) {
      const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async diff(worktreePath, baseSha) {
      const { stdout } = await exec('git', ['diff', '--binary', baseSha], {
        cwd: worktreePath,
        maxBuffer: DIFF_MAX_BUFFER,
      })
      return stdout
    },
    async diffStat(worktreePath, baseSha) {
      const { stdout } = await exec('git', ['diff', '--stat', baseSha], { cwd: worktreePath, maxBuffer: DIFF_MAX_BUFFER })
      return stdout
    },
    async apply(worktreePath, diff) {
      await exec('git', ['reset', '--hard', '--quiet'], { cwd: worktreePath })
      await exec('git', ['clean', '-fdq'], { cwd: worktreePath })
      await gitWithStdin(worktreePath, ['apply', '--binary', '--whitespace=nowarn'], diff)
    },
    async pullRequestUrl(worktreePath) {
      try {
        const { stdout } = await exec('gh', ['pr', 'view', '--json', 'url', '--jq', '.url'], { cwd: worktreePath })
        return stdout.trim() || undefined
      } catch {
        return undefined
      }
    },
  }
}

function gitWithStdin(cwd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Could not apply the worker's diff to the reviewer worktree: ${stderr.trim() || `git exited ${code}`}`))
    })
    child.stdin.on('error', () => { /* surfaced via close */ })
    child.stdin.end(input)
  })
}
