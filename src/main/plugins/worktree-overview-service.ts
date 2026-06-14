import type { Project, AgentSession, AheadBehind } from '../../shared/types'
import type { WorktreeOverviewEntry, WorktreeStatus, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { WorktreeInfo } from '../git/worktree-manager'
import type { WorktreeMeta } from '../git/worktree-meta'
import { isGitProject } from '../../shared/project-kind'
import { debugLog } from '../app/debug-log'

export interface WorktreeOverviewDeps {
  listProjects(): Project[]
  listSessions(): AgentSession[]
  listWorktrees(projectPath: string): Promise<WorktreeInfo[]>
  getAheadBehind(worktreePath: string, baseBranch: string): Promise<AheadBehind>
  getDirty(worktreePath: string): Promise<boolean>
  getLastCommitISO(worktreePath: string): Promise<string | null>
  readMeta(worktreePath: string): Promise<WorktreeMeta | null>
  removeWorktree(projectPath: string, worktreePath: string): Promise<void>
  pathExists(p: string): boolean
  listMergedBranches(projectPath: string, baseBranch: string): Promise<string[]>
  listWorktreeBranches(projectPath: string): Promise<string[]>
  getBranchDates(projectPath: string): Promise<Record<string, string>>
  deleteMergedBranch(projectPath: string, branch: string): Promise<void>
}

export interface WorktreeOverviewService {
  list(): Promise<WorktreeOverviewEntry[]>
  remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
  pruneStale(): Promise<string[]>
  listMergedOrphanBranches(): Promise<BranchOverviewEntry[]>
  deleteMergedBranch(projectId: string, branch: string): Promise<void>
  deleteAllMergedBranches(projectId: string): Promise<string[]>
}

export function createWorktreeOverviewService(deps: WorktreeOverviewDeps): WorktreeOverviewService {
  const gitProjects = (): Project[] => deps.listProjects().filter((p) => isGitProject(p))

  async function locate(worktreePath: string): Promise<Project | null> {
    for (const project of gitProjects()) {
      let worktrees: WorktreeInfo[]
      try { worktrees = await deps.listWorktrees(project.path) }
      catch (err) { debugLog(`[worktree-overview] locate: skipping ${project.path}: ${err}`); continue }
      if (worktrees.some((w) => w.path === worktreePath)) return project
    }
    return null
  }

  /** Merged branches of `project` that have no worktree and aren't the base — the prunable set. */
  async function orphanBranchesFor(project: Project): Promise<string[]> {
    const merged = await deps.listMergedBranches(project.path, project.baseBranch)
    const inUse = new Set(await deps.listWorktreeBranches(project.path))
    return merged.filter((b) => b !== project.baseBranch && !inUse.has(b))
  }

  return {
    async list(): Promise<WorktreeOverviewEntry[]> {
      const sessionsByPath = new Map(deps.listSessions().map((s) => [s.worktreePath, s]))
      const out: WorktreeOverviewEntry[] = []
      for (const project of gitProjects()) {
        let worktrees: WorktreeInfo[]
        try { worktrees = await deps.listWorktrees(project.path) }
        catch (err) { debugLog(`[worktree-overview] list: skipping ${project.path}: ${err}`); continue }
        for (const wt of worktrees) {
          const session = sessionsByPath.get(wt.path)
          const exists = deps.pathExists(wt.path)
          const meta = await deps.readMeta(wt.path)
          let status: WorktreeStatus
          if (!exists) status = 'stale'
          else if (session && session.pid != null) status = 'active'
          else status = 'idle'
          const ab = exists ? await deps.getAheadBehind(wt.path, project.baseBranch) : { ahead: 0, behind: 0 }
          out.push({
            worktreePath: wt.path,
            projectId: project.id,
            projectName: project.name,
            branch: wt.branch,
            status,
            sessionId: session?.id ?? null,
            ahead: ab.ahead,
            behind: ab.behind,
            dirty: exists ? await deps.getDirty(wt.path) : false,
            lastCommitISO: exists ? await deps.getLastCommitISO(wt.path) : null,
            locked: meta?.locked ?? false,
          })
        }
      }
      return out
    },

    async remove(worktreePath, opts): Promise<void> {
      const project = await locate(worktreePath)
      if (!project) throw new Error(`worktree not found: ${worktreePath}`)
      const meta = await deps.readMeta(worktreePath)
      if (meta?.locked) throw new Error(`worktree is locked: ${worktreePath}`)
      if (deps.pathExists(worktreePath) && !opts?.force) {
        const dirty = await deps.getDirty(worktreePath)
        const { ahead } = await deps.getAheadBehind(worktreePath, project.baseBranch)
        if (dirty || ahead > 0) {
          throw new Error(`GUARD: ${worktreePath} has uncommitted or unpushed changes; pass force to remove`)
        }
      }
      await deps.removeWorktree(project.path, worktreePath)
    },

    async pruneStale(): Promise<string[]> {
      const removed: string[] = []
      for (const project of gitProjects()) {
        let worktrees: WorktreeInfo[]
        try { worktrees = await deps.listWorktrees(project.path) }
        catch (err) { debugLog(`[worktree-overview] pruneStale: skipping ${project.path}: ${err}`); continue }
        for (const wt of worktrees) {
          if (deps.pathExists(wt.path)) continue
          const meta = await deps.readMeta(wt.path)
          if (meta?.locked) continue
          try { await deps.removeWorktree(project.path, wt.path); removed.push(wt.path) }
          catch (err) { debugLog(`[worktree-overview] pruneStale: ${wt.path} failed: ${err}`) }
        }
      }
      return removed
    },

    async listMergedOrphanBranches(): Promise<BranchOverviewEntry[]> {
      const out: BranchOverviewEntry[] = []
      for (const project of gitProjects()) {
        let orphans: string[]
        let dates: Record<string, string>
        try {
          orphans = await orphanBranchesFor(project)
          dates = await deps.getBranchDates(project.path)
        } catch (err) { debugLog(`[worktree-overview] branches: skipping ${project.path}: ${err}`); continue }
        for (const branch of orphans) {
          out.push({ projectId: project.id, projectName: project.name, branch, lastCommitISO: dates[branch] ?? null })
        }
      }
      return out
    },

    async deleteMergedBranch(projectId, branch): Promise<void> {
      const project = deps.listProjects().find((p) => p.id === projectId && isGitProject(p))
      if (!project) throw new Error(`project not found: ${projectId}`)
      // git `-d` is the safety net: it refuses unless the branch is fully merged and not checked out.
      await deps.deleteMergedBranch(project.path, branch)
    },

    async deleteAllMergedBranches(projectId): Promise<string[]> {
      const project = deps.listProjects().find((p) => p.id === projectId && isGitProject(p))
      if (!project) throw new Error(`project not found: ${projectId}`)
      // Recompute the prunable set at execution time (don't trust a stale webview list), then
      // delete each with safe `-d`; a per-branch failure is logged and skipped, not fatal.
      const deleted: string[] = []
      for (const branch of await orphanBranchesFor(project)) {
        try { await deps.deleteMergedBranch(project.path, branch); deleted.push(branch) }
        catch (err) { debugLog(`[worktree-overview] deleteAll: ${branch} failed: ${err}`) }
      }
      return deleted
    },
  }
}
