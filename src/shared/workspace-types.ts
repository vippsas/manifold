import type { FileChange } from './types'

/** A workspace is a place to work, not a folder group: it owns one checkout of
 *  every repo it spans, and every agent in it works there. Two features over the
 *  same repos are two workspaces, never two worktrees inside one.
 *
 *  A **home** workspace (`worktreePaths` absent) is the repos' own clones — the
 *  one you get when you add a repository, and the only place work lands on the
 *  folder you opened. Every workspace created after that is a **worktree**
 *  workspace: its own checkout of each repo, all on `branchName`. */
export interface Workspace {
  id: string
  name: string
  /** Ordered; projectIds[0] is the primary repo — every agent here runs in it,
   *  with the rest passed along as additional roots. */
  projectIds: string[]
  createdAt: string
  /** Runtime every agent in this workspace uses; optional for workspaces persisted before per-workspace runtimes (fall back to the global default). */
  runtimeId?: string
  /** The branch every git repo here is checked out on. Absent on a home
   *  workspace, which sits on whatever the user has checked out in the clone. */
  branchName?: string
  /** projectId -> this workspace's checkout of that repo: a worktree for a git
   *  repo, the folder itself for a non-git one (edited in place, never removed).
   *  Absent on a home workspace. */
  worktreePaths?: Record<string, string>
}

/** Git status of one repo checkout in a workspace — one section of the Source
 *  Control view, which lists every member repo the way VS Code's SCM view
 *  lists the repos of a multi-root workspace. */
export interface WorkspaceRepoStatus {
  projectId: string
  projectName: string
  /** The workspace's checkout of this repo: its worktree, or the clone itself
   *  on a home workspace. */
  checkoutPath: string
  /** The checked-out branch; empty when HEAD is unresolvable (no commits yet). */
  branch: string
  /** Uncommitted working-tree changes, staged or not. */
  changes: FileChange[]
}

export interface WorkspaceCreateOptions {
  name: string
  projectIds: string[]
  runtimeId?: string
}

/** Options for WorkspaceManager.spawnAgent(workspaceId, options) — the workspace id is passed separately, not in this bag.
 *
 *  There is no branch here on purpose: the workspace owns the branch, and every
 *  agent in it works on that one. A second branch over the same repos is a
 *  second workspace. */
export interface WorkspaceSpawnAgentOptions {
  runtimeId: string
  /** Optional name for the agent; blank leaves it named after its runtime. */
  displayName?: string
  /** When true, launch in non-interactive (Chat) mode; mirrors SpawnAgentOptions.nonInteractive. */
  nonInteractive?: boolean
}
