// src/main/plugins/agent-spawn-service.ts
// Main-side service backing the builtin-only `agent:spawn` capability: spawn a
// sibling agent session next to a base session and drive its PTY with raw input.
// The watch plugin calls this surface via manifold.agents instead of
// SessionManager directly.
import type { SessionManager } from '../session/session-manager'
import { gitExec } from '../git/git-exec'

type SessionAccess = Pick<SessionManager, 'createSession' | 'killSession' | 'sendInput' | 'getSession'>

const READY_POLL_MS = 250
const DEFAULT_READY_TIMEOUT_MS = 30_000

/** AgentStatus plus 'missing' for a session that no longer exists. */
export type SpawnedSessionStatus = 'running' | 'waiting' | 'done' | 'error' | 'missing'

export interface NativeAgentSpawnOptions {
  title: string
  runtimeId: string
  newWorktree: boolean
  nonInteractive?: boolean
}

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

export interface NativeAgentSpawnService extends AgentSpawnService {
  /** Core-only orchestration path. Plugin spawnSibling deliberately keeps its
   *  existing same-runtime, same-worktree contract. */
  spawnAgent(baseSessionId: string, opts: NativeAgentSpawnOptions): Promise<{
    sessionId: string
    runtimeId: string
    worktreePath: string
  }>
}

export interface AgentSpawnServiceOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  resolveHead?: (worktreePath: string) => Promise<string>
}

export function createAgentSpawnService(sm: SessionAccess, options: AgentSpawnServiceOptions = {}): NativeAgentSpawnService {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const resolveHead = options.resolveHead
    ?? (async (worktreePath: string): Promise<string> => (await gitExec(['rev-parse', 'HEAD'], worktreePath)).trim())

  async function spawn(baseSessionId: string, opts: {
    title?: string
    groupId?: string
    runtimeId?: string
    newWorktree?: boolean
    nonInteractive?: boolean
    orchestratedBy?: string
  }): Promise<{ sessionId: string; runtimeId: string; worktreePath: string }> {
    const base = sm.getSession(baseSessionId)
    if (!base) throw new Error(`no session ${baseSessionId}`)
    const baseRef = opts.newWorktree ? await resolveHead(base.worktreePath) : undefined
    const sibling = await sm.createSession({
      projectId: base.projectId,
      runtimeId: opts.runtimeId ?? base.runtimeId,
      prompt: opts.title ?? 'Plugin agent',
      existingWorktreePath: opts.newWorktree ? undefined : base.worktreePath,
      ...(opts.newWorktree ? { baseBranch: baseRef } : {}),
      groupId: opts.groupId,
      // An agent naming no workspace is grouped only into *home* workspaces holding its project,
      // so a child of an agent in a worktree workspace would belong to none: the dock would not
      // list it and would prune any tab opened for it.
      ...(base.workspaceId ? { workspaceId: base.workspaceId } : {}),
      ...(opts.nonInteractive !== undefined ? { nonInteractive: opts.nonInteractive } : {}),
      ...(opts.orchestratedBy ? { orchestratedBy: opts.orchestratedBy } : {}),
    })
    return {
      sessionId: sibling.id,
      runtimeId: sibling.runtimeId,
      worktreePath: sibling.worktreePath,
    }
  }

  return {
    async spawnSibling(baseSessionId, opts) {
      const child = await spawn(baseSessionId, opts ?? {})
      return { sessionId: child.sessionId }
    },
    async spawnAgent(baseSessionId, opts) {
      // Core orchestration marks its workers so their chat turns run guarded.
      return spawn(baseSessionId, { ...opts, orchestratedBy: baseSessionId })
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
