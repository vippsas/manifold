import type { Project, AgentSession, AheadBehind } from '../../shared/types'
import type { WorktreeOverviewEntry, WorktreeStatus, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { WorktreeInfo } from '../git/worktree-manager'
import type { WorktreeMeta } from '../git/worktree-meta'
import { isGitProject } from '../../shared/project-kind'

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
}

export interface WorktreeOverviewService {
  list(): Promise<WorktreeOverviewEntry[]>
  remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
  pruneStale(): Promise<string[]>
  listMergedOrphanBranches(): Promise<BranchOverviewEntry[]>
}

export function createWorktreeOverviewService(deps: WorktreeOverviewDeps): WorktreeOverviewService {
  const gitProjects = (): Project[] => deps.listProjects().filter((p) => isGitProject(p))

  async function locate(worktreePath: string): Promise<Project | null> {
    for (const project of gitProjects()) {
      let worktrees: WorktreeInfo[]
      try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
      if (worktrees.some((w) => w.path === worktreePath)) return project
    }
    return null
  }

  return {
    async list(): Promise<WorktreeOverviewEntry[]> {
      const sessionsByPath = new Map(deps.listSessions().map((s) => [s.worktreePath, s]))
      const out: WorktreeOverviewEntry[] = []
      for (const project of gitProjects()) {
        let worktrees: WorktreeInfo[]
        try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
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
        try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
        for (const wt of worktrees) {
          if (deps.pathExists(wt.path)) continue
          const meta = await deps.readMeta(wt.path)
          if (meta?.locked) continue
          try { await deps.removeWorktree(project.path, wt.path); removed.push(wt.path) } catch { /* per-row: skip failures */ }
        }
      }
      return removed
    },

    async listMergedOrphanBranches(): Promise<BranchOverviewEntry[]> {
      const out: BranchOverviewEntry[] = []
      for (const project of gitProjects()) {
        let merged: string[]
        let inUse: string[]
        let dates: Record<string, string>
        try {
          merged = await deps.listMergedBranches(project.path, project.baseBranch)
          inUse = await deps.listWorktreeBranches(project.path)
          dates = await deps.getBranchDates(project.path)
        } catch { continue }
        const inUseSet = new Set(inUse)
        for (const branch of merged) {
          if (branch === project.baseBranch) continue
          if (inUseSet.has(branch)) continue
          out.push({
            projectId: project.id,
            projectName: project.name,
            branch,
            lastCommitISO: dates[branch] ?? null,
          })
        }
      }
      return out
    },
  }
}
