// src/plugin-host/lm-api.ts
import { HOST_LM, type RpcEndpoint } from '../shared/plugins/rpc'
import type { LanguageModelChat, ManifoldApi } from '../shared/plugins/api-types'
import type { WorkspaceContext } from './workspace-api'

interface HostLmProxy {
  $selectChatModels(sessionId: string | undefined): Promise<{ id: string }[]>
  $sendRequest(sessionId: string | undefined, prompt: string, opts: { timeoutMs?: number } | undefined): Promise<{ text: string }>
}

export function createLmApi(endpoint: RpcEndpoint, workspace: WorkspaceContext): ManifoldApi['lm'] {
  const host = endpoint.getProxy<HostLmProxy>(HOST_LM)
  return {
    async selectChatModels(): Promise<LanguageModelChat[]> {
      const sessionId = workspace.activeSessionId
      const models = await host.$selectChatModels(sessionId)
      return models.map((m) => ({
        id: m.id,
        // Phase A: one-shot, non-streaming. `token` is accepted for VS Code-shape
        // fidelity but not wired to host cancellation yet (aiGenerate has a timeout).
        sendRequest: (prompt, opts) => host.$sendRequest(sessionId, prompt, opts),
      }))
    },
  }
}
