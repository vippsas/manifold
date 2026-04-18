import * as fs from 'node:fs'
import * as path from 'node:path'
import type { OrchestratorLaunchContext, OrchestratorLaunchSpec, OrchestratorLauncher } from './types'

export const copilotLauncher: OrchestratorLauncher = {
  prepare(ctx: OrchestratorLaunchContext): OrchestratorLaunchSpec {
    const configDir = path.join(ctx.coordinationPath, 'copilot')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'mcp-config.json'),
      JSON.stringify(
        {
          mcpServers: {
            'manifold-orchestrator': {
              type: 'local',
              command: 'node',
              args: [ctx.bridgeScriptPath],
              tools: ['*'],
            },
          },
        },
        null,
        2,
      ),
    )

    const args = [
      ...ctx.runtimeArgs,
      '--config-dir', configDir,
      '--disable-builtin-mcps',
      '--allow-all-tools',
    ]
    if (ctx.initialPrompt !== undefined) args.push('-p', ctx.initialPrompt)

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
