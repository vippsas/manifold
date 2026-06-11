// src/main/plugins/agent-spawn-service.ts
// Main-side service backing the builtin-only `agent:spawn` capability: spawn a
// sibling agent session next to a base session and drive its PTY with raw input.
// The watch plugin calls this surface via manifold.agents instead of
// SessionManager directly.
import type { SessionManager } from '../session/session-manager'

type SessionAccess = Pick<SessionManager, 'createSession' | 'killSession' | 'sendInput' | 'getSession'>

const READY_POLL_MS = 250
const DEFAULT_READY_TIMEOUT_MS = 30_000

/** AgentStatus plus 'missing' for a session that no longer exists. */
export type SpawnedSessionStatus = 'running' | 'waiting' | 'done' | 'error' | 'missing'

export interface AgentSpawnService {
  spawnSibling(baseSessionId: string, opts?: { title?: string; groupId?: string }): Promise<{ sessionId: string }>
  sendText(sessionId: string, text: string): void
  /** Resolve true once the session's TUI prompt is rendered (status 'waiting');
   *  false on timeout or if the session disappears. Callers may proceed on false
   *  (matching the watch playlist-runner's non-fatal ready timeout). */
  whenReady(sessionId: string, timeoutMs?: number): Promise<boolean>
  getStatus(sessionId: string): SpawnedSessionStatus
  kill(sessionId: string): Promise<void>
}

export interface AgentSpawnServiceOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function createAgentSpawnService(sm: SessionAccess, options: AgentSpawnServiceOptions = {}): AgentSpawnService {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))

  return {
    async spawnSibling(baseSessionId, opts) {
      const base = sm.getSession(baseSessionId)
      if (!base) throw new Error(`no session ${baseSessionId}`)
      const sibling = await sm.createSession({
        projectId: base.projectId,
        runtimeId: base.runtimeId,
        prompt: opts?.title ?? 'Plugin agent',
        existingWorktreePath: base.worktreePath,
        groupId: opts?.groupId,
      })
      return { sessionId: sibling.id }
    },
    sendText(sessionId, text) {
      sm.sendInput(sessionId, text)
    },
    async whenReady(sessionId, timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
      const deadline = now() + timeoutMs
      while (now() < deadline) {
        const s = sm.getSession(sessionId)
        if (!s) return false
        if (s.status === 'waiting') return true
        await sleep(READY_POLL_MS)
      }
      return false
    },
    getStatus(sessionId) {
      return sm.getSession(sessionId)?.status ?? 'missing'
    },
    async kill(sessionId) {
      await sm.killSession(sessionId)
    },
  }
}
