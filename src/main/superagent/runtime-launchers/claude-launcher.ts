import * as fs from 'node:fs'
import * as path from 'node:path'
import type { OrchestratorLaunchContext, OrchestratorLaunchSpec, OrchestratorLauncher } from './types'

export const claudeLauncher: OrchestratorLauncher = {
  prepare(ctx: OrchestratorLaunchContext): OrchestratorLaunchSpec {
    const mcpConfigPath = path.join(ctx.coordinationPath, 'mcp-config.json')
    if (!fs.existsSync(mcpConfigPath)) {
      fs.writeFileSync(
        mcpConfigPath,
        JSON.stringify(
          { mcpServers: { 'manifold-orchestrator': { command: 'node', args: [ctx.bridgeScriptPath] } } },
          null,
          2,
        ),
      )
    }

    const args = [
      ...ctx.runtimeArgs,
      '--mcp-config', mcpConfigPath,
      '--strict-mcp-config',
    ]
    if (ctx.initialPrompt !== undefined) args.push(ctx.initialPrompt)

    return {
      binary: ctx.runtimeBinary,
      args,
      env: {
        MANIFOLD_SUPERAGENT_ID: ctx.superagentId,
        MANIFOLD_MCP_SOCKET: ctx.mcpSocketPath,
      },
      cwd: ctx.coordinationPath,
    }
  },
}
