import * as fs from 'node:fs'
import * as path from 'node:path'
import simpleGit, { SimpleGit } from 'simple-git'
import { generateBranchName } from './branch-namer'

export interface WorktreeInfo {
  branch: string
  path: string
}

const WORKTREE_DIR = '.manifold/worktrees'

export class WorktreeManager {
  private getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath)
  }

  private getWorktreeBase(projectPath: string): string {
    return path.join(projectPath, WORKTREE_DIR)
  }

  async createWorktree(
    projectPath: string,
    baseBranch: string,
    branchName?: string
  ): Promise<WorktreeInfo> {
    const git = this.getGit(projectPath)
    const branch = branchName ?? (await generateBranchName(projectPath))
    const worktreeBase = this.getWorktreeBase(projectPath)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // Create a new branch from the base branch and set up the worktree
    await git.raw(['worktree', 'add', '-b', branch, worktreePath, baseBranch])

    return { branch, path: worktreePath }
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    const git = this.getGit(projectPath)

    // Get the branch associated with this worktree before removing it
    const worktrees = await this.listWorktrees(projectPath)
    const target = worktrees.find((w) => w.path === worktreePath)

    await git.raw(['worktree', 'remove', worktreePath, '--force'])

    // Clean up the branch if we found one
    if (target) {
      try {
        await git.deleteLocalBranch(target.branch, true)
      } catch {
        // Branch may already be deleted or may be the current branch; ignore
      }
    }
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const git = this.getGit(projectPath)
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const entries: WorktreeInfo[] = []
    let currentPath: string | null = null
    let currentBranch: string | null = null

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim()
      } else if (line.startsWith('branch ')) {
        const fullRef = line.slice('branch '.length).trim()
        currentBranch = fullRef.replace('refs/heads/', '')
      } else if (line.trim() === '' && currentPath && currentBranch) {
        // Only include manifold worktrees
        if (currentBranch.startsWith('manifold/')) {
          entries.push({ branch: currentBranch, path: currentPath })
        }
        currentPath = null
        currentBranch = null
      }
    }

    // Handle last entry if file doesn't end with a blank line
    if (currentPath && currentBranch && currentBranch.startsWith('manifold/')) {
      entries.push({ branch: currentBranch, path: currentPath })
    }

    return entries
  }
}
