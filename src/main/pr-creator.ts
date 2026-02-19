import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class PrCreator {
  async isGhAvailable(): Promise<boolean> {
    try {
      await execFileAsync('gh', ['--version'])
      return true
    } catch {
      return false
    }
  }

  async pushBranch(worktreePath: string, branchName: string): Promise<void> {
    await execFileAsync('git', ['push', '-u', 'origin', branchName], {
      cwd: worktreePath
    })
  }

  async createPR(
    worktreePath: string,
    branchName: string,
    options: { title?: string; body?: string; baseBranch: string }
  ): Promise<string> {
    await this.ensureGhAvailable()
    await this.pushBranch(worktreePath, branchName)

    const args = this.buildPrArgs(branchName, options)
    const { stdout } = await execFileAsync('gh', args, { cwd: worktreePath })

    return this.parsePrUrl(stdout)
  }

  private async ensureGhAvailable(): Promise<void> {
    const available = await this.isGhAvailable()
    if (!available) {
      throw new Error('GitHub CLI (gh) is not installed or not authenticated. Install it from https://cli.github.com/')
    }
  }

  private buildPrArgs(
    branchName: string,
    options: { title?: string; body?: string; baseBranch: string }
  ): string[] {
    const title = options.title ?? `Manifold: ${branchName}`
    const body = options.body ?? `Automated PR created by Manifold from branch \`${branchName}\`.`

    return [
      'pr', 'create',
      '--title', title,
      '--body', body,
      '--base', options.baseBranch,
      '--head', branchName
    ]
  }

  private parsePrUrl(stdout: string): string {
    const url = stdout.trim()
    if (!url.startsWith('http')) {
      throw new Error(`Unexpected gh output: ${url}`)
    }
    return url
  }
}
