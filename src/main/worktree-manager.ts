import * as fs from 'node:fs'
import * as path from 'node:path'
import { generateBranchName, repoPrefix } from './branch-namer'
import { readWorktreeMeta, removeWorktreeMeta } from './worktree-meta'
import { gitExec } from './git-exec'

export interface WorktreeInfo {
  branch: string
  path: string
}

export class WorktreeManager {
  constructor(private storagePath: string) {}

  private getWorktreeBase(projectName: string): string {
    return path.join(this.storagePath, 'worktrees', projectName)
  }

  async createWorktree(
    projectPath: string,
    baseBranch: string,
    projectName: string,
    branchName?: string
  ): Promise<WorktreeInfo> {
    const branch = branchName ?? (await generateBranchName(projectPath))
    const worktreeBase = this.getWorktreeBase(projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // Ensure the base branch ref is valid (empty repos have no commits/refs)
    await this.ensureBaseRef(projectPath, baseBranch)

    // Create a new branch from the base branch and set up the worktree
    await gitExec(['worktree', 'add', '-b', branch, worktreePath, baseBranch], projectPath)

    return { branch, path: worktreePath }
  }

  private async ensureBaseRef(projectPath: string, baseBranch: string): Promise<void> {
    try {
      await gitExec(['rev-parse', '--verify', baseBranch], projectPath)
      return
    } catch {
      // baseBranch doesn't resolve
    }

    // Check whether repo is truly empty (no commits at all)
    const empty = await this.isEmptyRepo(projectPath)
    if (!empty) {
      throw new Error(`Base branch "${baseBranch}" does not exist`)
    }

    // Bootstrap empty repo with an initial commit so worktree has a valid start point
    await gitExec(['commit', '--allow-empty', '-m', 'Initial commit'], projectPath)
  }

  private async isEmptyRepo(projectPath: string): Promise<boolean> {
    try {
      await gitExec(['rev-parse', 'HEAD'], projectPath)
      return false
    } catch {
      return true
    }
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    const prefix = repoPrefix(projectPath)
    // Get the branch associated with this worktree before removing it
    const worktrees = await this.listWorktrees(projectPath)
    const target = worktrees.find((w) => w.path === worktreePath)

    await gitExec(['worktree', 'remove', worktreePath, '--force'], projectPath)
    await removeWorktreeMeta(worktreePath)

    // Only delete branches that Manifold created (repo-prefixed).
    // External branches (existing branches checked out as worktrees) are left intact.
    if (target && target.branch.startsWith(prefix)) {
      try {
        await gitExec(['branch', '-D', target.branch], projectPath)
      } catch {
        // Branch may already be deleted or may be the current branch; ignore
      }
    }
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const raw = await gitExec(['worktree', 'list', '--porcelain'], projectPath)
    const candidates: WorktreeInfo[] = []
    let currentPath: string | null = null
    let currentBranch: string | null = null

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim()
      } else if (line.startsWith('branch ')) {
        const fullRef = line.slice('branch '.length).trim()
        currentBranch = fullRef.replace('refs/heads/', '')
      } else if (line.trim() === '' && currentPath && currentBranch) {
        candidates.push({ branch: currentBranch, path: currentPath })
        currentPath = null
        currentBranch = null
      }
    }

    // Handle last entry if output doesn't end with a blank line
    if (currentPath && currentBranch) {
      candidates.push({ branch: currentBranch, path: currentPath })
    }

    // Filter to only Manifold-managed worktrees (those with metadata files)
    const entries: WorktreeInfo[] = []
    for (const wt of candidates) {
      const meta = await readWorktreeMeta(wt.path)
      if (meta) {
        entries.push(wt)
      }
    }

    return entries
  }
}
