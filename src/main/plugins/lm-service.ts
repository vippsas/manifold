// src/main/plugins/lm-service.ts
// Main-side service backing manifold.lm — one-shot LLM generation via the active
// session's runtime, mirroring how src/main/loop/loop-judge-adapter.ts calls aiGenerate.
import type { SessionManager } from '../session/session-manager'
import type { GitOperations } from '../git/git-operations'
import { getRuntimeById } from '../agent/runtimes'

const DEFAULT_TIMEOUT_MS = 120_000

type SessionAccess = Pick<SessionManager, 'getSession'>
type GitAccess = Pick<GitOperations, 'aiGenerate'>
type RuntimeResolver = typeof getRuntimeById

export interface LmService {
  selectChatModels(sessionId: string | undefined): Promise<{ id: string }[]>
  sendRequest(sessionId: string | undefined, prompt: string, opts?: { timeoutMs?: number }): Promise<{ text: string }>
}

export function createLmService(sm: SessionAccess, gitOps: GitAccess, getRuntime: RuntimeResolver = getRuntimeById): LmService {
  function resolve(sessionId: string | undefined): { runtime: NonNullable<ReturnType<RuntimeResolver>>; worktreePath: string } | null {
    if (!sessionId) return null
    const session = sm.getSession(sessionId)
    if (!session) return null
    const runtime = getRuntime(session.runtimeId)
    if (!runtime) return null
    return { runtime, worktreePath: session.worktreePath }
  }

  return {
    async selectChatModels(sessionId) {
      const r = resolve(sessionId)
      return r ? [{ id: r.runtime.id }] : []
    },
    async sendRequest(sessionId, prompt, opts) {
      const r = resolve(sessionId)
      if (!r) throw new Error('no active session runtime for language model request')
      const text = await gitOps.aiGenerate(r.runtime, prompt, r.worktreePath, r.runtime.aiModelArgs ?? [], {
        silent: true,
        timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })
      return { text }
    },
  }
}
