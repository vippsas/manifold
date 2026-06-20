import type { TokenUsage } from '../../shared/verdict-types'
import type { InternalSession } from './session-types'

interface CodexUsageCtx {
  onRunUsage?: (session: InternalSession, runId: string, usage: TokenUsage, turns: number) => void
  onRuntimeMeta?: (session: InternalSession) => void
}

export interface CodexUsageEventPayload {
  info?: {
    total_token_usage?: {
      input_tokens?: number
      cached_input_tokens?: number
      output_tokens?: number
    }
  }
}

export function captureCodexThread(ctx: CodexUsageCtx, session: InternalSession, threadId: unknown, ptyId?: string): void {
  if (typeof threadId !== 'string' || !threadId.trim()) return
  const nextThreadId = threadId.trim()
  if (session.codexThreadId === nextThreadId) return

  const turnsByRun = session.codexUsageTurnsByRun
  if (ptyId && turnsByRun?.[ptyId] !== undefined) {
    const turns = turnsByRun[ptyId]
    delete turnsByRun[ptyId]
    turnsByRun[nextThreadId] = Math.max(turnsByRun[nextThreadId] ?? 0, turns)
  }
  session.codexThreadId = nextThreadId
  session.codexPublishedGeneratedImageSources = []
  ctx.onRuntimeMeta?.(session)
}

export function recordCodexUserMessage(session: InternalSession, ptyId?: string): void {
  const runId = codexRunId(session, ptyId)
  session.codexUsageTurnsByRun = session.codexUsageTurnsByRun ?? {}
  session.codexUsageTurnsByRun[runId] = (session.codexUsageTurnsByRun[runId] ?? 0) + 1
}

export function recordCodexTokenCount(
  ctx: CodexUsageCtx,
  session: InternalSession,
  payload: CodexUsageEventPayload,
  ptyId?: string,
): void {
  const total = payload.info?.total_token_usage
  if (!total) return
  const runId = codexRunId(session, ptyId)
  ctx.onRunUsage?.(session, runId, {
    inputTokens: total.input_tokens ?? 0,
    outputTokens: total.output_tokens ?? 0,
    cacheReadTokens: total.cached_input_tokens ?? 0,
    cacheCreationTokens: 0,
  }, session.codexUsageTurnsByRun?.[runId] ?? 0)
}

function codexRunId(session: InternalSession, ptyId?: string): string {
  return session.codexThreadId ?? ptyId ?? session.id
}
