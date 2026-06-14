import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'

/** Merged branches with no worktree, grouped under the repo that owns them. */
export interface RepoBranches {
  projectId: string
  projectName: string
  branches: BranchOverviewEntry[]
}

/** The four headline counts shown as KPI tiles. */
export interface BoardStats {
  active: number
  idle: number
  dirty: number
  prunable: number
}

const byRepoThenBranch = (a: WorktreeOverviewEntry, b: WorktreeOverviewEntry): number =>
  a.projectName.localeCompare(b.projectName) || a.branch.localeCompare(b.branch)

/** Worktrees with a live agent — the "Active" column. */
export function activeWorktrees(entries: WorktreeOverviewEntry[]): WorktreeOverviewEntry[] {
  return entries.filter((e) => e.status === 'active').sort(byRepoThenBranch)
}

/** Everything not live (idle + stale) — the "Idle" column. */
export function idleWorktrees(entries: WorktreeOverviewEntry[]): WorktreeOverviewEntry[] {
  return entries.filter((e) => e.status !== 'active').sort(byRepoThenBranch)
}

export function computeStats(entries: WorktreeOverviewEntry[], branches: BranchOverviewEntry[]): BoardStats {
  return {
    active: entries.filter((e) => e.status === 'active').length,
    idle: entries.filter((e) => e.status !== 'active').length,
    dirty: entries.filter((e) => e.dirty).length,
    prunable: branches.length,
  }
}

/** Group prunable branches by repo, branches newest-first, repos by descending branch count then name. */
export function groupBranchesByRepo(branches: BranchOverviewEntry[]): RepoBranches[] {
  const groups = new Map<string, RepoBranches>()
  for (const b of branches) {
    const g: RepoBranches = groups.get(b.projectName) ?? { projectId: b.projectId, projectName: b.projectName, branches: [] }
    g.branches.push(b)
    groups.set(b.projectName, g)
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      // newest merged at the top (ISO dates sort lexically = chronologically)
      branches: g.branches.slice().sort((a, b) => (b.lastCommitISO ?? '').localeCompare(a.lastCommitISO ?? '')),
    }))
    .sort((a, b) => b.branches.length - a.branches.length || a.projectName.localeCompare(b.projectName))
}
