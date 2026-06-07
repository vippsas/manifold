// src/main/plugins/agent-control-service.ts
// Main-side service that drives a session's agent for one turn and owns the
// turn-end heuristic. The heuristic is duplicated from src/main/loop/loop-adapters.ts
// (createWaitForTurnEnd) so the core loop feature stays untouched in Phase A; the
// core copy is removed in Phase C when loop becomes a plugin.
import type { SessionManager } from '../session/session-manager'
import type { TurnOutcome } from '../../shared/plugins/api-types'
import { detectStatus, hasCodexInteractivePrompt } from '../agent/status-detector'

type SessionAccess = Pick<SessionManager, 'getSession' | 'getInternalSession' | 'sendInput'>

const IDLE_GRACE_MS = 4000
const DEFAULT_BUDGET_SECONDS = 300

export interface TurnEndWaiterOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  idleGraceMs?: number
}

export interface WaitForTurnEndContext {
  agentPtyId?: string
  turnStartedAt?: number
  outputLengthAtStart?: number
}

export type WaitForTurnEnd = (sessionId: string, budgetSeconds: number, signal: AbortSignal, context?: WaitForTurnEndContext) => Promise<TurnOutcome>

/** Wait for an agent session's turn to end after a prompt was sent. Interactive
 *  turns end after post-prompt output plus idle/output silence. Stream-json
 *  turns may instead report a structured completion event or finish their
 *  one-shot PTY while preview/dev-server plumbing still keeps the session
 *  status at "running". */
export function createTurnEndWaiter(sm: SessionAccess, options: TurnEndWaiterOptions = {}): WaitForTurnEnd {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const pollMs = options.pollMs ?? 500
  const idleGraceMs = options.idleGraceMs ?? IDLE_GRACE_MS
  const idleStates = new Set(['done', 'waiting'])

  return async (sessionId, budgetSeconds, signal, context) => {
    const turnStart = context?.turnStartedAt ?? now()
    const deadline = turnStart + budgetSeconds * 1000
    let idleSince: number | null = null
    let sawPostPromptOutput = false

    while (now() < deadline) {
      if (signal.aborted) return 'aborted'
      const internal = sm.getInternalSession(sessionId)
      const status = internal?.status ?? 'done'
      const detectedStatus = internal?.runtimeId && internal.outputBuffer
        ? detectStatus(internal.outputBuffer, internal.runtimeId)
        : status
      const hasCodexIdlePrompt = internal?.runtimeId === 'codex' && internal.outputBuffer
        ? hasCodexInteractivePrompt(internal.outputBuffer, { allowActiveMarker: true })
        : false
      const effectiveStatus = internal?.runtimeId === 'codex' && internal.outputBuffer
        ? detectedStatus
        : idleStates.has(status) ? status : detectedStatus
      const lastOutput = internal?.lastOutputTime ?? 0
      const lastTurnCompleted = internal?.lastTurnCompletedTime ?? 0
      const outputLength = internal?.outputBuffer?.length ?? 0
      if (lastOutput > turnStart) sawPostPromptOutput = true
      if (
        context?.outputLengthAtStart !== undefined &&
        outputLength > context.outputLengthAtStart &&
        internal?.runtimeId === 'codex' &&
        detectedStatus === 'waiting'
      ) {
        sawPostPromptOutput = true
      }
      const agentPtyEnded = !!context?.agentPtyId && !!internal?.nonInteractive && !internal.ptyId
      const sawTurnCompleted = lastTurnCompleted > turnStart

      const isIdle = idleStates.has(effectiveStatus)
      if (!isIdle) idleSince = null
      else if (idleSince === null) idleSince = now()

      const t = now()
      const silenceMs = t - Math.max(lastOutput, turnStart)
      const idleMs = idleSince === null ? 0 : t - idleSince
      if (sawPostPromptOutput && isIdle && idleMs >= idleGraceMs) return 'ended'
      if (sawPostPromptOutput && hasCodexIdlePrompt && silenceMs >= idleGraceMs) return 'ended'
      if (sawTurnCompleted && silenceMs >= idleGraceMs) return 'ended'
      if (agentPtyEnded && silenceMs >= idleGraceMs) return 'ended'

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
        const beforePrompt = sm.getInternalSession(sessionId)
        const turnStartedAt = beforePrompt?.nonInteractive ? Date.now() : undefined
        const outputLengthAtStart = beforePrompt?.outputBuffer?.length
        sm.sendInput(sessionId, prompt)
        const agentPtyId = sm.getInternalSession(sessionId)?.ptyId || undefined
        await sleep(400)
        sm.sendInput(sessionId, '\r')
        return await waitForTurnEnd(sessionId, opts?.budgetSeconds ?? DEFAULT_BUDGET_SECONDS, abort.signal, { agentPtyId, turnStartedAt, outputLengthAtStart })
      } finally {
        inflight.delete(sessionId)
      }
    },
    cancelTurn(sessionId) {
      inflight.get(sessionId)?.abort()
    },
  }
}
