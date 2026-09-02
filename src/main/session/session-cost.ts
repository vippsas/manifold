import type { SessionCostSummary } from '../../shared/types'
import { estimateCostUsd } from './model-pricing'
import { readClaudeTranscriptUsage } from './transcript-usage-reader'

interface SessionCostLocator {
  runtimeId: string
  worktreePath: string
  sessionId: string
  claudeProjectsDir: string
}

/**
 * Read one live session's usage and estimate its cost.
 *
 * Deliberately reads only the on-disk transcript. The live accumulator that
 * `resolveSessionUsage` drains at termination is *destructive*
 * (`SessionUsageAccumulator.take`), so touching it here would steal usage the
 * verdict recorder still needs. Interactive Claude is spawned with
 * `--session-id`, so its transcript is the source of truth anyway.
 *
 * Returns null for non-Claude runtimes and for sessions with no transcript yet.
 */
export async function readSessionCost(opts: SessionCostLocator): Promise<SessionCostSummary | null> {
  if (opts.runtimeId !== 'claude') return null
  const usage = await readClaudeTranscriptUsage({
    claudeProjectsDir: opts.claudeProjectsDir,
    worktreePath: opts.worktreePath,
    sessionId: opts.sessionId,
  })
  if (!usage) return null
  const { usd, unpricedModels, rows } = estimateCostUsd(usage.byRate)
  return {
    tokenUsage: usage.tokenUsage,
    turns: usage.turns,
    costUsd: usd,
    unpricedModels,
    byModel: rows,
    contextTokens: usage.contextTokens,
  }
}
