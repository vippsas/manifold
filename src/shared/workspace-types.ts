export interface Workspace {
  id: string
  name: string
  /** Ordered; projectIds[0] is the default primary repo (the agent's cwd). */
  projectIds: string[]
  createdAt: string
  /** Runtime every agent in this workspace uses; optional for workspaces persisted before per-workspace runtimes (fall back to the global default). */
  runtimeId?: string
}

export interface WorkspaceCreateOptions {
  name: string
  projectIds: string[]
  runtimeId?: string
}

/** Options for WorkspaceManager.spawnAgent(workspaceId, options) — the workspace id is passed separately, not in this bag. */
export interface WorkspaceSpawnAgentOptions {
  runtimeId: string
  prompt?: string
  branchName?: string
  /** Repo to use as the agent cwd/primary; defaults to the first repo when absent or unknown. */
  homeProjectId?: string
}
