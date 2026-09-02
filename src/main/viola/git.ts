import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const DIFF_MAX_BUFFER = 10 * 1024 * 1024

export interface ViolaGit {
  head(worktreePath: string): Promise<string>
  diff(worktreePath: string, baseSha: string): Promise<string>
  diffStat(worktreePath: string, baseSha: string): Promise<string>
  /** Resets a Viola-owned scratch worktree to HEAD, then applies `diff` as uncommitted changes.
   *  Rejects any path that is not a linked worktree, so a shared main checkout is never reset. */
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
      await assertLinkedWorktree(worktreePath)
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

/** `apply` resets and cleans its target, so it must only ever run on a linked worktree Viola
 *  created for a review. A main checkout is somebody's real working copy — for a project added
 *  as a plain folder every agent shares it, and resetting it would destroy uncommitted work. */
async function assertLinkedWorktree(worktreePath: string): Promise<void> {
  // Ask git for both paths in its own absolute form. Resolving them ourselves would compare a
  // symlinked prefix (macOS /var) against git's physical one (/private/var) and never match.
  const { stdout } = await exec(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    { cwd: worktreePath },
  )
  const [gitDir, commonDir] = stdout.trim().split('\n').map((line) => line.trim())
  // A linked worktree's git dir lives under the common dir; a main checkout's is the common dir.
  if (!gitDir || !commonDir || gitDir === commonDir) {
    throw new Error(`Refusing to reset ${worktreePath}: it is not an isolated worktree but a main checkout.`)
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
