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

  async getDiffStats(
    worktreePath: string,
    baseBranch: string,
  ): Promise<{ diffLines: { added: number; removed: number }; filesChanged: number }> {
    if (!existsSync(worktreePath)) {
      return { diffLines: { added: 0, removed: 0 }, filesChanged: 0 }
    }
    try {
      const stdout = await gitExec(['diff', '--numstat', '--find-renames', baseBranch], worktreePath)
      let added = 0, removed = 0, filesChanged = 0
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue
        const [a, r] = line.split('\t')
        const aNum = parseInt(a, 10)
        const rNum = parseInt(r, 10)
        if (!Number.isNaN(aNum)) added += aNum
        if (!Number.isNaN(rNum)) removed += rNum
        filesChanged += 1
      }
      return { diffLines: { added, removed }, filesChanged }
    } catch {
      return { diffLines: { added: 0, removed: 0 }, filesChanged: 0 }
    }
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    if (!existsSync(worktreePath)) return []

    // Paths this worktree actually touched. A two-dot `git diff <base>` (below)
    // also surfaces files that differ only because the base branch advanced —
    // i.e. changed in another worktree — so we flag those as foreign.
    const ownPaths = await this.getOwnChangedPaths(worktreePath, baseBranch)

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

        const change: FileChange = { path: filePath, type }
        if (ownPaths && !ownPaths.has(filePath)) change.foreignWorktree = true
        changes.push(change)
        seen.add(filePath)
      }
    } catch {
      // May fail if no commits yet on branch
    }

    // Untracked files only exist in this worktree, so they're always our own.
    for (const filePath of await this.listUntrackedFiles(worktreePath)) {
      if (seen.has(filePath)) continue
      changes.push({ path: filePath, type: 'added' })
    }

    return changes
  }

  /**
   * Paths changed by this worktree relative to the base branch: committed since
   * the merge-base (`<base>...HEAD`) plus uncommitted tracked edits (`HEAD`).
   * Returns null when provenance can't be determined (e.g. no commits yet) so
   * callers don't mis-flag inherited files as foreign.
   */
  private async getOwnChangedPaths(worktreePath: string, baseBranch: string): Promise<Set<string> | null> {
    let committed: string
    try {
      committed = await gitExec(['diff', '--name-only', '--find-renames', `${baseBranch}...HEAD`], worktreePath)
    } catch {
      return null
    }

    const paths = new Set<string>()
    for (const filePath of committed.split('\n').filter(Boolean)) paths.add(filePath)

    try {
      const working = await gitExec(['diff', '--name-only', '--find-renames', 'HEAD'], worktreePath)
      for (const filePath of working.split('\n').filter(Boolean)) paths.add(filePath)
    } catch {
      // No HEAD edits or HEAD unreadable; committed paths alone are enough.
    }

    return paths
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
