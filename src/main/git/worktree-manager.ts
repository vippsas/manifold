import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { generateBranchName } from './branch-namer'
import { prepareManagedWorktree } from './managed-worktree'
import { readWorktreeMeta, removeWorktreeMeta } from './worktree-meta'
import { debugLog } from '../app/debug-log'
import { gitExec } from './git-exec'
import { withRepoLock } from './repo-lock'

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

    return withRepoLock(projectPath, async () => {
      // Ensure the base branch ref is valid (empty repos have no commits/refs)
      await this.ensureBaseRef(projectPath, baseBranch)

      // Create a new branch from the base branch and set up the worktree
      await gitExec(['worktree', 'add', '-b', branch, worktreePath, baseBranch], projectPath)
      try {
        // Reset the freshly created worktree index so stale admin/index state cannot leak across sessions.
        await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
        await prepareManagedWorktree(worktreePath)
      } catch (err) {
        // The meta sidecar isn't written until session-creator runs later, so a
        // failure here would leave an orphan branch+dir that listWorktrees hides
        // (no meta) and that blocks reuse of the branch name. Roll back the add.
        await this.rollbackWorktreeAdd(projectPath, worktreePath, branch)
        throw err
      }

      return { branch, path: worktreePath }
    })
  }

  /** Undo a `worktree add -b`: remove the worktree dir and delete the branch it created. */
  private async rollbackWorktreeAdd(projectPath: string, worktreePath: string, branch: string): Promise<void> {
    try {
      await gitExec(['worktree', 'remove', worktreePath, '--force'], projectPath)
    } catch (err) {
      debugLog(`[worktree] rollback remove failed for ${worktreePath}: ${err}`)
      await fsp.rm(worktreePath, { recursive: true, force: true }).catch(() => {})
      await gitExec(['worktree', 'prune'], projectPath).catch(() => {})
    }
    await gitExec(['branch', '-D', branch], projectPath).catch((err) => {
      debugLog(`[worktree] rollback branch -D ${branch} failed: ${err}`)
    })
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

    return withRepoLock(projectPath, async () => {
      await gitExec(['worktree', 'prune'], projectPath).catch(() => {})

      const currentBranch = (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)).trim()
      if (currentBranch === branch) {
        await gitExec(['checkout', baseBranch], projectPath)
      }

      await gitExec(['worktree', 'add', worktreePath, branch], projectPath)
      await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
      await prepareManagedWorktree(worktreePath)

      return { branch, path: worktreePath }
    })
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

  /** Force-delete a local branch (best-effort). Used to roll back a leaked `worktree add -b` branch. */
  async deleteBranch(projectPath: string, branch: string): Promise<void> {
    await withRepoLock(projectPath, async () => {
      await gitExec(['branch', '-D', branch], projectPath)
    })
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    return withRepoLock(projectPath, async () => {
      // Remove the worktree first; only drop the sidecar metadata once the
      // worktree is actually gone. SessionDiscovery uses the metadata's presence
      // to resurrect sessions on every `agent:sessions` call. Deleting the meta
      // up-front would orphan the worktree if *every* removal path below fails
      // (e.g. a file lock): it would stay on disk and in `git worktree list` yet
      // be invisible to Manifold forever. Keeping the meta until the worktree is
      // removed makes such a failure recoverable — Manifold still sees it.
      try {
        await gitExec(['worktree', 'remove', worktreePath, '--force'], projectPath)
        await removeWorktreeMeta(worktreePath)
        return
      } catch (err1) {
        debugLog(`[worktree] remove --force failed for ${worktreePath}: ${err1}`)
      }

      try {
        // Locked worktrees require a second --force (git 2.20+).
        await gitExec(['worktree', 'remove', '--force', '--force', worktreePath], projectPath)
        await removeWorktreeMeta(worktreePath)
        return
      } catch (err2) {
        debugLog(`[worktree] remove -f -f failed for ${worktreePath}: ${err2}`)
      }

      // Last resort: nuke the directory and prune git's admin entry so neither
      // `git worktree list` nor SessionDiscovery picks it up again.
      let rmOk = false
      try {
        await fsp.rm(worktreePath, { recursive: true, force: true })
        rmOk = true
      } catch (err) {
        debugLog(`[worktree] fs.rm failed for ${worktreePath}: ${err}`)
      }
      try {
        await gitExec(['worktree', 'prune'], projectPath)
      } catch (err) {
        debugLog(`[worktree] prune failed in ${projectPath}: ${err}`)
      }

      if (rmOk) {
        // The worktree directory is gone, so SessionDiscovery can't resurrect a
        // live session — drop the meta. If even fs.rm failed, keep the meta so
        // the orphan stays visible to Manifold and remains removable later.
        await removeWorktreeMeta(worktreePath)
      }
    })
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
      if (wt.path === projectPath) continue
      const meta = await readWorktreeMeta(wt.path)
      if (meta) {
        entries.push(wt)
      }
    }

    return entries
  }
}
