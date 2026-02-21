import { existsSync } from 'node:fs'
import { FileChange, FileChangeType } from '../shared/types'
import { gitExec } from './git-exec'

export class DiffProvider {
  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    if (!existsSync(worktreePath)) return ''

    // Stage all changes to capture untracked files
    try {
      await gitExec(['add', '.'], worktreePath)
    } catch {
      // May fail if worktree is empty; continue
    }

    // Single diff: staging area vs base branch shows the net result.
    return await gitExec(['diff', '--cached', baseBranch], worktreePath)
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    if (!existsSync(worktreePath)) return []

    // Stage everything so untracked files are included
    try {
      await gitExec(['add', '.'], worktreePath)
    } catch {
      // May fail if worktree is empty; continue
    }

    // Net changes: staging area vs base branch
    const changes: FileChange[] = []
    try {
      const stdout = await gitExec(['diff', '--cached', '--numstat', baseBranch], worktreePath)
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t')
        if (parts.length < 3) continue
        const [added, deleted, filePath] = parts
        const insertions = added === '-' ? 0 : parseInt(added, 10)
        const deletions = deleted === '-' ? 0 : parseInt(deleted, 10)

        let type: FileChangeType = 'modified'
        if (deletions > 0 && insertions === 0) type = 'deleted'
        else if (insertions > 0 && deletions === 0) type = 'added'

        changes.push({ path: filePath, type })
      }
    } catch {
      // May fail if no commits yet on branch
    }

    return changes
  }
}
