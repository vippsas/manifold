// src/plugin-host/agents-api.ts
import { HOST_AGENTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AgentSession, CancellationToken, ManifoldApi, SpawnedSessionStatus, TurnOutcome } from '../shared/plugins/api-types'
import type { Capability } from '../shared/plugins/manifest'
import { CapabilityError } from './gated-api'
import type { WorkspaceContext } from './workspace-api'

interface HostAgentsProxy {
  $runTurn(pluginId: string, sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined): Promise<TurnOutcome>
  $cancelTurn(pluginId: string, sessionId: string): Promise<void>
  $spawnSibling(pluginId: string, baseSessionId: string, opts: { title?: string; groupId?: string } | undefined): Promise<{ sessionId: string }>
  $sendText(pluginId: string, sessionId: string, text: string): Promise<void>
  $whenReady(pluginId: string, sessionId: string, timeoutMs: number | undefined): Promise<boolean>
  $getStatus(pluginId: string, sessionId: string): Promise<SpawnedSessionStatus>
  $kill(pluginId: string, sessionId: string): Promise<void>
  $reveal(pluginId: string, sessionId: string, title: string | undefined): Promise<void>
}

/** The namespace gate (gated-api) admits callers holding either `agent:control`
 *  or `agent:spawn`; each method re-checks its own capability here so a plugin
 *  holding only one of the two can't reach the other's surface. The main side
 *  independently re-validates builtin origin per method (see ExtensionHost). */
export function createAgentsApi(
  endpoint: RpcEndpoint,
  workspace: WorkspaceContext,
  pluginId: string,
  caps: ReadonlySet<Capability>,
): ManifoldApi['agents'] {
  const host = endpoint.getProxy<HostAgentsProxy>(HOST_AGENTS)
  function requireCap(cap: Capability): void {
    if (!caps.has(cap)) throw new CapabilityError(cap)
  }
  const makeAgent = (sessionId: string): AgentSession | undefined => {
    if (!sessionId) return undefined
    return {
      sessionId,
      async runTurn(prompt, opts, token?: CancellationToken): Promise<TurnOutcome> {
        requireCap('agent:control')
        const sub = token?.onCancellationRequested(() => { void host.$cancelTurn(pluginId, sessionId) })
        try {
          return await host.$runTurn(pluginId, sessionId, prompt, opts)
        } finally {
          sub?.dispose()
        }
      },
      async sendText(text: string): Promise<void> {
        requireCap('agent:spawn')
        await host.$sendText(pluginId, sessionId, text)
      },
      whenReady(timeoutMs?: number): Promise<boolean> {
        requireCap('agent:spawn')
        return host.$whenReady(pluginId, sessionId, timeoutMs)
      },
      getStatus(): Promise<SpawnedSessionStatus> {
        requireCap('agent:spawn')
        return host.$getStatus(pluginId, sessionId)
      },
      async kill(): Promise<void> {
        requireCap('agent:spawn')
        await host.$kill(pluginId, sessionId)
      },
      async reveal(title?: string): Promise<void> {
        requireCap('agent:spawn')
        await host.$reveal(pluginId, sessionId, title)
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
    async spawnSibling(baseSessionId, opts): Promise<AgentSession> {
      requireCap('agent:spawn')
      const { sessionId } = await host.$spawnSibling(pluginId, baseSessionId, opts)
      const agent = makeAgent(sessionId)
      if (!agent) throw new Error('spawnSibling returned an empty session id')
      return agent
    },
  }
}
