// src/main/plugins/agent-control-service.ts
// Main-side service that drives a session's agent for one turn and owns the
// turn-end heuristic. The heuristic is duplicated from src/main/loop/loop-adapters.ts
// (createWaitForTurnEnd) so the core loop feature stays untouched in Phase A; the
// core copy is removed in Phase C when loop becomes a plugin.
import type { SessionManager } from '../session/session-manager'
import type { TurnOutcome } from '../../shared/plugins/api-types'

type SessionAccess = Pick<SessionManager, 'getSession' | 'getInternalSession' | 'sendInput'>

const IDLE_GRACE_MS = 4000
const DEFAULT_BUDGET_SECONDS = 300

export interface TurnEndWaiterOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  idleGraceMs?: number
}

export type WaitForTurnEnd = (sessionId: string, budgetSeconds: number, signal: AbortSignal) => Promise<TurnOutcome>

/** Wait for an agent session's turn to end after a prompt was sent. A turn is
 *  "ended" only when the session has produced output since the prompt AND has
 *  been idle + output-silent for the grace period. */
export function createTurnEndWaiter(sm: SessionAccess, options: TurnEndWaiterOptions = {}): WaitForTurnEnd {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const pollMs = options.pollMs ?? 500
  const idleGraceMs = options.idleGraceMs ?? IDLE_GRACE_MS
  const idleStates = new Set(['done', 'waiting'])

  return async (sessionId, budgetSeconds, signal) => {
    const turnStart = now()
    const deadline = turnStart + budgetSeconds * 1000
    let idleSince: number | null = null
    let sawPostPromptOutput = false

    while (now() < deadline) {
      if (signal.aborted) return 'aborted'
      const internal = sm.getInternalSession(sessionId)
      const status = internal?.status ?? 'done'
      const lastOutput = internal?.lastOutputTime ?? 0
      if (lastOutput > turnStart) sawPostPromptOutput = true

      const isIdle = idleStates.has(status)
      if (!isIdle) idleSince = null
      else if (idleSince === null) idleSince = now()

      const t = now()
      const silenceMs = t - Math.max(lastOutput, turnStart)
      const idleMs = idleSince === null ? 0 : t - idleSince
      if (sawPostPromptOutput && isIdle && idleMs >= idleGraceMs && silenceMs >= idleGraceMs) return 'ended'

      await sleep(pollMs)
    }
    return 'timeout'
  }
}

export interface AgentControlService {
  runTurn(
    sessionId: string,
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
  ): Promise<TurnOutcome>
  cancelTurn(sessionId: string): void
}

export interface AgentControlServiceOptions {
  waitForTurnEnd?: WaitForTurnEnd
  sleep?: (ms: number) => Promise<void>
}

export function createAgentControlService(sm: SessionAccess, options: AgentControlServiceOptions = {}): AgentControlService {
  const waitForTurnEnd = options.waitForTurnEnd ?? createTurnEndWaiter(sm)
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const inflight = new Map<string, AbortController>()

  return {
    async runTurn(sessionId, prompt, opts) {
      if (inflight.has(sessionId)) throw new Error(`a turn is already running for session ${sessionId}`)
      const worktreePath = sm.getSession(sessionId)?.worktreePath
      if (!worktreePath) throw new Error(`no worktree for session ${sessionId}`)

      const abort = new AbortController()
      inflight.set(sessionId, abort)
      try {
        if (opts?.clearContext) {
          sm.sendInput(sessionId, '/clear')
          await sleep(200)
          sm.sendInput(sessionId, '\r')
          await sleep(800)
        }
        sm.sendInput(sessionId, prompt)
        await sleep(400)
        sm.sendInput(sessionId, '\r')
        return await waitForTurnEnd(sessionId, opts?.budgetSeconds ?? DEFAULT_BUDGET_SECONDS, abort.signal)
      } finally {
        inflight.delete(sessionId)
      }
    },
    cancelTurn(sessionId) {
      inflight.get(sessionId)?.abort()
    },
  }
}
