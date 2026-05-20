import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { generateBranchName } from './branch-namer'
import { prepareManagedWorktree } from './managed-worktree'
import { readWorktreeMeta, removeWorktreeMeta } from './worktree-meta'
import { debugLog } from '../app/debug-log'
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
    branchName?: string,
    taskDescription?: string
  ): Promise<WorktreeInfo> {
    const branch = branchName ?? (await generateBranchName(projectPath, taskDescription ?? ''))
    const worktreeBase = this.getWorktreeBase(projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // Ensure the base branch ref is valid (empty repos have no commits/refs)
    await this.ensureBaseRef(projectPath, baseBranch)

    // Create a new branch from the base branch and set up the worktree
    await gitExec(['worktree', 'add', '-b', branch, worktreePath, baseBranch], projectPath)
    // Reset the freshly created worktree index so stale admin/index state cannot leak across sessions.
    await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
    await prepareManagedWorktree(worktreePath)

    return { branch, path: worktreePath }
  }

  async createWorktreeFromBranch(
    projectPath: string,
    projectName: string,
    branch: string,
    baseBranch: string,
  ): Promise<WorktreeInfo> {
    const worktreeBase = this.getWorktreeBase(projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    if (fs.existsSync(worktreePath)) {
      await gitExec(['reset', '--mixed', 'HEAD'], worktreePath).catch(() => {})
      await prepareManagedWorktree(worktreePath)
      return { branch, path: worktreePath }
    }

    await gitExec(['worktree', 'prune'], projectPath).catch(() => {})

    const currentBranch = (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)).trim()
    if (currentBranch === branch) {
      await gitExec(['checkout', baseBranch], projectPath)
    }

    await gitExec(['worktree', 'add', worktreePath, branch], projectPath)
    await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
    await prepareManagedWorktree(worktreePath)

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

  async branchExists(projectPath: string, branch: string): Promise<boolean> {
    try {
      await gitExec(['rev-parse', '--verify', `refs/heads/${branch}`], projectPath)
      return true
    } catch {
      return false
    }
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    // Always remove the sidecar metadata first, regardless of what happens with
    // the git operations below. SessionDiscovery uses the metadata's presence to
    // resurrect sessions on every `agent:sessions` call — if the sidecar
    // survives, the deleted agent reappears in the sidebar after each click.
    await removeWorktreeMeta(worktreePath)

    try {
      await gitExec(['worktree', 'remove', worktreePath, '--force'], projectPath)
      return
    } catch (err1) {
      debugLog(`[worktree] remove --force failed for ${worktreePath}: ${err1}`)
    }

    try {
      // Locked worktrees require a second --force (git 2.20+).
      await gitExec(['worktree', 'remove', '--force', '--force', worktreePath], projectPath)
      return
    } catch (err2) {
      debugLog(`[worktree] remove -f -f failed for ${worktreePath}: ${err2}`)
    }

    // Last resort: nuke the directory and prune git's admin entry so neither
    // `git worktree list` nor SessionDiscovery picks it up again.
    try {
      await fsp.rm(worktreePath, { recursive: true, force: true })
    } catch (err) {
      debugLog(`[worktree] fs.rm failed for ${worktreePath}: ${err}`)
    }
    try {
      await gitExec(['worktree', 'prune'], projectPath)
    } catch (err) {
      debugLog(`[worktree] prune failed in ${projectPath}: ${err}`)
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
