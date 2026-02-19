import simpleGit, { DiffResultTextFile, SimpleGit } from 'simple-git'
import { FileChange, FileChangeType } from '../shared/types'

export class DiffProvider {
  private getGit(worktreePath: string): SimpleGit {
    return simpleGit(worktreePath)
  }

  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    const git = this.getGit(worktreePath)

    // Stage all changes first to capture untracked files
    try {
      await git.add('.')
    } catch {
      // May fail if worktree is empty; continue
    }

    const diff = await git.diff([`${baseBranch}...HEAD`])
    const stagedDiff = await git.diff(['--cached'])

    // Combine committed and staged diffs
    if (diff && stagedDiff) {
      return `${diff}\n${stagedDiff}`
    }
    return diff || stagedDiff || ''
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    const git = this.getGit(worktreePath)
    const changes: FileChange[] = []

    await this.collectCommittedChanges(git, baseBranch, changes)
    await this.collectUncommittedChanges(git, changes)

    return changes
  }

  private async collectCommittedChanges(
    git: SimpleGit,
    baseBranch: string,
    changes: FileChange[]
  ): Promise<void> {
    try {
      const diffSummary = await git.diffSummary([`${baseBranch}...HEAD`])
      for (const file of diffSummary.files) {
        const changeType = this.inferChangeType(file)
        changes.push({ path: file.file, type: changeType })
      }
    } catch {
      // May fail if no commits yet on branch
    }
  }

  private async collectUncommittedChanges(
    git: SimpleGit,
    changes: FileChange[]
  ): Promise<void> {
    try {
      const status = await git.status()
      this.addUniqueChanges(changes, status.created, 'added')
      this.addUniqueChanges(changes, status.modified, 'modified')
      this.addUniqueChanges(changes, status.deleted, 'deleted')
    } catch {
      // Status may fail; continue with what we have
    }
  }

  private addUniqueChanges(
    changes: FileChange[],
    files: string[],
    type: FileChangeType
  ): void {
    for (const file of files) {
      if (!changes.find((c) => c.path === file)) {
        changes.push({ path: file, type })
      }
    }
  }

  private inferChangeType(file: DiffResultTextFile | { file: string; binary: true; before: number; after: number }): FileChangeType {
    if (file.binary) return 'modified'
    const textFile = file as DiffResultTextFile
    if (textFile.deletions > 0 && textFile.insertions === 0) return 'deleted'
    if (textFile.insertions > 0 && textFile.deletions === 0) return 'added'
    return 'modified'
  }
}
