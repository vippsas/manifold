import { randomUUID } from 'node:crypto'
import { isGitProject } from '../../shared/project-kind'
import type { Project } from '../../shared/types'
import type { Workspace } from '../../shared/workspace-types'
import { readWorktreeMeta, writeWorktreeMeta } from '../git/worktree-meta'
import type { WorkspaceStore } from './workspace-store'

export interface WorktreePromotionDeps {
  store: WorkspaceStore
  projectRegistry: { listProjects: () => Project[] }
  worktreeManager: { listWorktrees: (projectPath: string) => Promise<{ branch: string; path: string }[]> }
}

/** `manifold/oslo` reads as the workspace "oslo" — the prefix is ours, not the
 *  user's, and it is already implied by where the workspace lives. */
function workspaceNameFor(branch: string): string {
  return branch.replace(/^manifold\//, '') || branch
}

/** Promotes worktrees that agents used to own into workspaces of their own.
 *
 *  Before, an agent cut a worktree per spawn and several of them stacked up
 *  inside one workspace; now a workspace *is* a checkout. Every worktree found
 *  on disk therefore becomes the workspace it always effectively was, named
 *  after its branch, so nobody's work goes missing in the move. A multi-repo
 *  agent's whole set becomes one workspace, since that is what it already was.
 *
 *  Runs on every start and is idempotent: a worktree some workspace already
 *  claims is skipped, so a second pass promotes nothing. */
export async function promoteAgentWorktreesToWorkspaces(deps: WorktreePromotionDeps): Promise<Workspace[]> {
  const claimed = new Set(deps.store.list().flatMap((w) => Object.values(w.worktreePaths ?? {})))
  const projects = deps.projectRegistry.listProjects().filter(isGitProject)
  const registered = new Set(projects.map((p) => p.id))
  const groups = new Map<string, { branch: string; worktreePaths: Record<string, string> }>()

  for (const project of projects) {
    let worktrees: { branch: string; path: string }[] = []
    try { worktrees = await deps.worktreeManager.listWorktrees(project.path) } catch { continue }

    for (const worktree of worktrees) {
      if (claimed.has(worktree.path)) continue
      const meta = await readWorktreeMeta(worktree.path)
      // A workspace agent recorded its whole set; a single-repo agent is a set of one.
      const set = Object.entries(meta?.workspaceWorktreePaths ?? { [project.id]: worktree.path })
        .filter(([projectId]) => registered.has(projectId))
      if (set.length === 0) continue

      // Every repo in a set finds the same set, so key on it rather than on the
      // repo we happened to reach it from.
      const key = set.map(([, p]) => p).sort().join('\u0000')
      if (groups.has(key)) continue
      groups.set(key, { branch: worktree.branch, worktreePaths: Object.fromEntries(set) })
    }
  }

  const promoted: Workspace[] = []
  for (const { branch, worktreePaths } of groups.values()) {
    const workspace: Workspace = {
      id: randomUUID(),
      name: workspaceNameFor(branch),
      projectIds: Object.keys(worktreePaths),
      createdAt: new Date().toISOString(),
      branchName: branch,
      worktreePaths,
    }
    deps.store.add(workspace)
    promoted.push(workspace)

    // Point the sidecars at the new workspace so the agents discovered from
    // these worktrees come back inside it instead of beside it.
    for (const worktreePath of Object.values(worktreePaths)) {
      const meta = await readWorktreeMeta(worktreePath)
      if (!meta) continue
      await writeWorktreeMeta(worktreePath, { ...meta, workspaceId: workspace.id, workspaceWorktreePaths: worktreePaths })
    }
  }
  return promoted
}
