export interface Workspace {
  id: string
  name: string
  /** Ordered; projectIds[0] is the default primary repo (the agent's cwd). */
  projectIds: string[]
  createdAt: string
}

export interface WorkspaceCreateOptions {
  name: string
  projectIds: string[]
}

/** Options for WorkspaceManager.spawnAgent(workspaceId, options) — the workspace id is passed separately, not in this bag. */
export interface WorkspaceSpawnAgentOptions {
  runtimeId: string
  prompt?: string
  branchName?: string
  /** Repo to use as the agent cwd/primary; defaults to the first repo when absent or unknown. */
  homeProjectId?: string
}
