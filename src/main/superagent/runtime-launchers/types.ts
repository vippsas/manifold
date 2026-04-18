export interface OrchestratorLaunchContext {
  superagentId: string
  coordinationPath: string
  bridgeScriptPath: string
  mcpSocketPath: string
  runtimeBinary: string
  runtimeArgs: readonly string[]
  initialPrompt: string | undefined
  /**
   * Full orchestrator context (role + fleet + task + tools) without the
   * user's first message. Rebuilt on every spawn — including resume — so
   * launchers that persist context (e.g. AGENTS.md for Codex) stay fresh.
   */
  persistentContext?: string
}

export interface OrchestratorLaunchSpec {
  binary: string
  args: string[]
  env: Record<string, string>
  cwd: string
}

export interface OrchestratorLauncher {
  prepare(ctx: OrchestratorLaunchContext): Promise<OrchestratorLaunchSpec> | OrchestratorLaunchSpec
}
