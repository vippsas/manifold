import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { OrchestratorLaunchContext, OrchestratorLaunchSpec, OrchestratorLauncher } from './types'

export const codexLauncher: OrchestratorLauncher = {
  prepare(ctx: OrchestratorLaunchContext): OrchestratorLaunchSpec {
    const codexHome = path.join(ctx.coordinationPath, 'codex-home')
    fs.mkdirSync(codexHome, { recursive: true })

    const tomlArgs = JSON.stringify([ctx.bridgeScriptPath])
    const tomlString = (s: string): string => JSON.stringify(s)
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      [
        '[mcp_servers.manifold-orchestrator]',
        `command = "node"`,
        `args = ${tomlArgs}`,
        '',
        '[mcp_servers.manifold-orchestrator.env]',
        `MANIFOLD_MCP_SOCKET = ${tomlString(ctx.mcpSocketPath)}`,
        `MANIFOLD_SUPERAGENT_ID = ${tomlString(ctx.superagentId)}`,
        '',
      ].join('\n'),
    )

    // Carry over user auth so the isolated CODEX_HOME still signs in. If
    // missing, we fall back to OPENAI_API_KEY passed through from process env
    // (validated at spawn time by Codex itself).
    const userAuth = path.join(os.homedir(), '.codex', 'auth.json')
    const targetAuth = path.join(codexHome, 'auth.json')
    if (fs.existsSync(userAuth) && !fs.existsSync(targetAuth)) {
      try { fs.copyFileSync(userAuth, targetAuth) } catch { /* best-effort */ }
    }

    // Persist orchestrator context (rules + fleet + initial user message) as
    // AGENTS.md in the coordination dir. Codex reads AGENTS.md from cwd on
    // every launch, so this survives resume and makes the orchestrator role
    // visible to the model instead of hoping a positional arg gets treated as
    // the first user message.
    const agentsMdPath = path.join(ctx.coordinationPath, 'AGENTS.md')
    if (ctx.persistentContext) {
      fs.writeFileSync(agentsMdPath, ctx.persistentContext + '\n')
    }

    const args = [...ctx.runtimeArgs]

    const env: Record<string, string> = {
      MANIFOLD_SUPERAGENT_ID: ctx.superagentId,
      MANIFOLD_MCP_SOCKET: ctx.mcpSocketPath,
      CODEX_HOME: codexHome,
    }
    if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY

    return { binary: ctx.runtimeBinary, args, env, cwd: ctx.coordinationPath }
  },
}
