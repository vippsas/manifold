import { existsSync } from 'node:fs'
import simpleGit, { DiffResultTextFile, SimpleGit } from 'simple-git'
import { FileChange, FileChangeType } from '../shared/types'

export class DiffProvider {
  private getGit(worktreePath: string): SimpleGit {
    return simpleGit(worktreePath)
  }

  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    if (!existsSync(worktreePath)) return ''
    const git = this.getGit(worktreePath)

    // Stage all changes to capture untracked files
    try {
      await git.add('.')
    } catch {
      // May fail if worktree is empty; continue
    }

    // Single diff: staging area vs base branch shows the net result.
    // If a committed change was reverted in the working tree, git add .
    // stages the reverted content, so it won't appear in this diff.
    return await git.diff(['--cached', baseBranch])
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    if (!existsSync(worktreePath)) return []
    const git = this.getGit(worktreePath)

    // Stage everything so untracked files are included
    try {
      await git.add('.')
    } catch {
      // May fail if worktree is empty; continue
    }

    // Net changes: staging area vs base branch
    const changes: FileChange[] = []
    try {
      const diffSummary = await git.diffSummary(['--cached', baseBranch])
      for (const file of diffSummary.files) {
        const changeType = this.inferChangeType(file)
        changes.push({ path: file.file, type: changeType })
      }
    } catch {
      // May fail if no commits yet on branch
    }

    return changes
  }

  private inferChangeType(file: DiffResultTextFile | { file: string; binary: true; before: number; after: number }): FileChangeType {
    if (file.binary) return 'modified'
    const textFile = file as DiffResultTextFile
    if (textFile.deletions > 0 && textFile.insertions === 0) return 'deleted'
    if (textFile.insertions > 0 && textFile.deletions === 0) return 'added'
    return 'modified'
  }
}
