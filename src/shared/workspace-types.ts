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
  /** Ordered; projectIds[0] is the default primary repo (the agent's cwd). */
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
  prompt?: string
  /** Repo to use as the agent cwd/primary; defaults to the first repo when absent or unknown. */
  homeProjectId?: string
  /** When true, launch in non-interactive (Chat) mode; mirrors SpawnAgentOptions.nonInteractive. */
  nonInteractive?: boolean
}
