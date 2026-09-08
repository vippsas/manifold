import type { AgentSession, Project } from '../../../shared/types'
import { isWorktreeWorkspace, type Workspace } from '../../../shared/workspace-types'
import { isLive, rowStatus, type RowStatus } from './agent-labels'
import { repoFoldKey, workspaceFoldKey } from './sidebar-fold-state'
import type { ProjectRecency } from './sidebar-recency'
import { sortWorkspaces, type SidebarSortMode } from './sidebar-sort'

/** One repo's family in the sidebar: its home workspace heads the group and the
 *  worktree workspaces cut off it hang underneath (#939). A multi-repo
 *  workspace belongs to the group of its primary repo and nowhere else. */
export interface RepoGroup {
  /** Fold-store key: the home card's, or `repo:<id>` when the repo has no home. */
  foldKey: string
  projectId: string | null
  repoName: string
  home: Workspace | null
  /** Worktree workspaces in display order, merged ones excluded. */
  worktrees: Workspace[]
  /** Merged worktree workspaces, same order; rendered behind the fold. */
  merged: Workspace[]
}

export interface GroupContext {
  mode: SidebarSortMode
  recency: ProjectRecency
  activeId: string | null
  /** Worktree workspaces whose branch a verdict recorded as merged. */
  mergedIds: ReadonlySet<string>
  /** Workspaces with a running or waiting agent; never folded as merged. */
  liveIds: ReadonlySet<string>
}

export function liveWorkspaceIds(sessionsByWorkspace: Record<string, AgentSession[]>): Set<string> {
  const ids = new Set<string>()
  for (const [id, sessions] of Object.entries(sessionsByWorkspace)) {
    if (isLive(sessions)) ids.add(id)
  }
  return ids
}

export function groupMembers(group: RepoGroup): Workspace[] {
  return [group.home, ...group.worktrees, ...group.merged].filter((w): w is Workspace => w !== null)
}

/** Every distinct agent state under a group, most urgent first — what a
 *  collapsed parent shows as small dots. */
export function groupStatuses(sessionLists: readonly AgentSession[][]): RowStatus[] {
  const present = new Set(sessionLists.map(rowStatus).filter((s): s is RowStatus => s !== null))
  return (['waiting', 'running', 'error'] as const).filter((s) => present.has(s))
}

export function groupWorkspaces(
  workspaces: readonly Workspace[],
  projects: readonly Project[],
  ctx: GroupContext,
): RepoGroup[] {
  const byKey = new Map<string, RepoGroup>()

  for (const workspace of workspaces) {
    const primary = projects.find((p) => p.id === workspace.projectIds[0])
    // Unknown primary: the workspace stands alone, named after itself, so
    // nothing ever disappears from the list.
    const bucket = primary ? `repo:${primary.id}` : `lone:${workspace.id}`
    let group = byKey.get(bucket)
    if (!group) {
      group = {
        // A lone group (primary repo not registered) gets its own namespaced
        // group key so closing the group can never also toggle its single
        // member's card, which shares the workspace id.
        foldKey: repoFoldKey(primary ? primary.id : `lone:${workspace.id}`),
        projectId: primary?.id ?? null,
        repoName: primary?.name ?? workspace.name,
        home: null,
        worktrees: [],
        merged: [],
      }
      byKey.set(bucket, group)
    }
    if (!isWorktreeWorkspace(workspace) && group.home === null) {
      // The home workspace is a member card like any other now; the group's
      // fold belongs to the repo header above it, so foldKey stays repo-keyed.
      group.home = workspace
    } else if (ctx.mergedIds.has(workspace.id) && !ctx.liveIds.has(workspace.id)) {
      group.merged.push(workspace)
    } else {
      group.worktrees.push(workspace)
    }
  }

  // Members order with the mode's own comparator, no pin: the group pin below
  // is what puts the active family first, and inside it the active row is the
  // most recently touched anyway.
  const memberCtx = { recency: ctx.recency, activeId: null, projects: [...projects] }
  const groups = [...byKey.values()].map((g) => ({
    ...g,
    worktrees: sortWorkspaces(g.worktrees, ctx.mode, memberCtx),
    merged: sortWorkspaces(g.merged, ctx.mode, memberCtx),
  }))

  if (ctx.mode === 'alpha') {
    return groups.sort((a, b) => a.repoName.localeCompare(b.repoName, undefined, { sensitivity: 'base' }))
  }
  const latest = (g: RepoGroup): number => Math.max(0, ...groupMembers(g).map((w) => ctx.recency[w.id] ?? 0))
  const holdsActive = (g: RepoGroup): number =>
    ctx.activeId !== null && groupMembers(g).some((w) => w.id === ctx.activeId) ? 1 : 0
  return groups.sort((a, b) => holdsActive(b) - holdsActive(a) || latest(b) - latest(a))
}

/** Case-insensitive substring over repo name, workspace name and branch. A
 *  repo-name hit keeps the whole family; otherwise members are trimmed to the
 *  hits. Merged members are searched like any other and surface inline — the
 *  fold is for browsing, not for hiding a name you typed. */
export function filterGroups(groups: readonly RepoGroup[], query: string): RepoGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...groups]
  const hits = (w: Workspace): boolean =>
    w.name.toLowerCase().includes(q) || (w.branchName?.toLowerCase().includes(q) ?? false)

  const out: RepoGroup[] = []
  for (const g of groups) {
    const all = [...g.worktrees, ...g.merged]
    if (g.repoName.toLowerCase().includes(q)) {
      out.push({ ...g, worktrees: all, merged: [] })
      continue
    }
    const home = g.home && hits(g.home) ? g.home : null
    const worktrees = all.filter(hits)
    if (home || worktrees.length > 0) out.push({ ...g, home, worktrees, merged: [] })
  }
  return out
}
