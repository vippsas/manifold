// resources/plugins/manifold.loop/src/git.ts
// Git adapter for the autoresearch loop. Pure Node — no manifold import (so it's unit-testable).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface LoopGitAdapter {
  getHeadSha(worktreePath: string): Promise<string>
  stageAllAndCommit(worktreePath: string, message: string): Promise<string>
  hardReset(worktreePath: string, sha: string): Promise<void>
  getChangedFilesCount(worktreePath: string): Promise<number>
  getDiff(worktreePath: string, sinceSha: string): Promise<string>
}

export function createGitAdapter(): LoopGitAdapter {
  return {
    async getHeadSha(worktreePath) {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async stageAllAndCommit(worktreePath, message) {
      await execFileAsync('git', ['add', '-A'], { cwd: worktreePath })
      await execFileAsync('git', ['commit', '-m', message, '--no-verify'], { cwd: worktreePath })
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async hardReset(worktreePath, sha) {
      await execFileAsync('git', ['reset', '--hard', sha], { cwd: worktreePath })
      await execFileAsync('git', ['clean', '-fd'], { cwd: worktreePath })
    },
    async getChangedFilesCount(worktreePath) {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: worktreePath })
      return stdout.split('\n').filter((line) => line.trim().length > 0).length
    },
    async getDiff(worktreePath, sinceSha) {
      const { stdout } = await execFileAsync('git', ['diff', sinceSha, '--', '.'], { cwd: worktreePath, maxBuffer: 16 * 1024 * 1024 })
      return stdout
    },
  }
}
