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
    async selectChatModels(sessionId?: string): Promise<LanguageModelChat[]> {
      // An explicit sessionId pins the model to a specific session (the loop judge
      // passes its pinned session so switching the active agent doesn't redirect or
      // strand the request); fall back to the active session when omitted.
      const targetSessionId = sessionId ?? workspace.activeSessionId
      const models = await host.$selectChatModels(targetSessionId)
      return models.map((m) => ({
        id: m.id,
        // Phase A: one-shot, non-streaming. `token` is accepted for VS Code-shape
        // fidelity but not wired to host cancellation yet (aiGenerate has a timeout).
        sendRequest: (prompt, opts) => host.$sendRequest(targetSessionId, prompt, opts),
      }))
    },
  }
}
