import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface ViolaGit {
  head(worktreePath: string): Promise<string>
  diff(worktreePath: string, baseSha: string): Promise<string>
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
        maxBuffer: 10 * 1024 * 1024,
      })
      return stdout
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
