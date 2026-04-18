import * as fs from 'node:fs'
import * as path from 'node:path'
import type { OrchestratorLaunchContext, OrchestratorLaunchSpec, OrchestratorLauncher } from './types'

export const geminiLauncher: OrchestratorLauncher = {
  prepare(ctx: OrchestratorLaunchContext): OrchestratorLaunchSpec {
    const geminiHome = path.join(ctx.coordinationPath, 'gemini-home')
    const settingsDir = path.join(geminiHome, '.gemini')
    fs.mkdirSync(settingsDir, { recursive: true })
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          mcpServers: {
            'manifold-orchestrator': {
              command: 'node',
              args: [ctx.bridgeScriptPath],
              trust: true,
            },
          },
        },
        null,
        2,
      ),
    )

    const args = [
      ...ctx.runtimeArgs,
      '--allowed-mcp-server-names', 'manifold-orchestrator',
    ]
    if (ctx.initialPrompt !== undefined) args.push('-p', ctx.initialPrompt)

    return {
      binary: ctx.runtimeBinary,
      args,
      env: {
        MANIFOLD_SUPERAGENT_ID: ctx.superagentId,
        MANIFOLD_MCP_SOCKET: ctx.mcpSocketPath,
        GEMINI_CLI_HOME: geminiHome,
      },
      cwd: ctx.coordinationPath,
    }
  },
}
