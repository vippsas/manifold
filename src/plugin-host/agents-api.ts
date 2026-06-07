// src/plugin-host/agents-api.ts
import { HOST_AGENTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AgentSession, CancellationToken, ManifoldApi, TurnOutcome } from '../shared/plugins/api-types'
import type { WorkspaceContext } from './workspace-api'

interface HostAgentsProxy {
  $runTurn(sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined): Promise<TurnOutcome>
  $cancelTurn(sessionId: string): Promise<void>
}

export function createAgentsApi(endpoint: RpcEndpoint, workspace: WorkspaceContext): ManifoldApi['agents'] {
  const host = endpoint.getProxy<HostAgentsProxy>(HOST_AGENTS)
  const makeAgent = (sessionId: string): AgentSession | undefined => {
    if (!sessionId) return undefined
    return {
      sessionId,
      async runTurn(prompt, opts, token?: CancellationToken): Promise<TurnOutcome> {
        const sub = token?.onCancellationRequested(() => { void host.$cancelTurn(sessionId) })
        try {
          return await host.$runTurn(sessionId, prompt, opts)
        } finally {
          sub?.dispose()
        }
      },
    }
  }

  return {
    get activeAgent(): AgentSession | undefined {
      const sessionId = workspace.activeSessionId
      return sessionId ? makeAgent(sessionId) : undefined
    },
    getAgent(sessionId: string): AgentSession | undefined {
      return makeAgent(sessionId)
    },
  }
}
