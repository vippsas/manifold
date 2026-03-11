import { execFile, type ExecFileException } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { FileChange, FileChangeType } from '../../shared/types'
import { gitExec } from './git-exec'

const execFileAsync = promisify(execFile)
const DIFF_MAX_BUFFER = 10 * 1024 * 1024

export class DiffProvider {
  async getOriginalContent(
    worktreePath: string,
    baseBranch: string,
    relativePath: string
  ): Promise<string | null> {
    try {
      return await gitExec(['show', `${baseBranch}:${relativePath}`], worktreePath)
    } catch {
      return null // File doesn't exist in base branch (new file)
    }
  }

  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    if (!existsSync(worktreePath)) return ''

    const diffParts: string[] = []

    // Compare the tracked working tree directly to the base branch without mutating the index.
    try {
      const trackedDiff = await gitExec(['diff', '--find-renames', baseBranch], worktreePath)
      if (trackedDiff) diffParts.push(trackedDiff.trimEnd())
    } catch {
      // May fail if no commits yet on branch; continue
    }

    for (const filePath of await this.listUntrackedFiles(worktreePath)) {
      const untrackedDiff = await this.getUntrackedFileDiff(worktreePath, filePath)
      if (untrackedDiff) diffParts.push(untrackedDiff.trimEnd())
    }

    return diffParts.join('\n')
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    if (!existsSync(worktreePath)) return []

    const changes: FileChange[] = []
    const seen = new Set<string>()

    // Net tracked changes vs base branch without touching the index.
    try {
      const stdout = await gitExec(['diff', '--name-status', '--find-renames', baseBranch], worktreePath)
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t')
        if (parts.length < 2) continue
        const status = parts[0]
        const filePath = parts[parts.length - 1]

        let type: FileChangeType = 'modified'
        if (status === 'A') type = 'added'
        else if (status === 'D') type = 'deleted'

        changes.push({ path: filePath, type })
        seen.add(filePath)
      }
    } catch {
      // May fail if no commits yet on branch
    }

    for (const filePath of await this.listUntrackedFiles(worktreePath)) {
      if (seen.has(filePath)) continue
      changes.push({ path: filePath, type: 'added' })
    }

    return changes
  }

  private async listUntrackedFiles(worktreePath: string): Promise<string[]> {
    try {
      const stdout = await gitExec(['ls-files', '--others', '--exclude-standard', '-z'], worktreePath)
      return stdout.split('\0').filter(Boolean)
    } catch {
      return []
    }
  }

  private async getUntrackedFileDiff(worktreePath: string, filePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--no-index', '--', '/dev/null', filePath],
        { cwd: worktreePath, maxBuffer: DIFF_MAX_BUFFER }
      )
      return stdout
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string }
      return execError.stdout ?? ''
    }
  }
}
