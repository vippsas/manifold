import type { TokenUsage } from '../../shared/verdict-types'
import type { SessionUsage } from './transcript-usage-reader'

interface Entry {
  usage: TokenUsage
  turns: number
}

/**
 * Per-session token/turn accumulator for chat-mode (print-mode) Claude turns.
 * Lives independently of InternalSession so it survives session teardown; the
 * verdict recorder drains it at termination via `take`.
 */
export class SessionUsageAccumulator {
  private readonly entries = new Map<string, Entry>()
  private readonly runEntries = new Map<string, Map<string, Entry>>()

  recordTurn(sessionId: string, usage: Partial<TokenUsage>): void {
    const entry = this.entries.get(sessionId) ?? {
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      turns: 0,
    }
    entry.usage.inputTokens += usage.inputTokens ?? 0
    entry.usage.outputTokens += usage.outputTokens ?? 0
    entry.usage.cacheReadTokens += usage.cacheReadTokens ?? 0
    entry.usage.cacheCreationTokens += usage.cacheCreationTokens ?? 0
    entry.turns += 1
    this.entries.set(sessionId, entry)
  }

  replaceRun(sessionId: string, runId: string, usage: TokenUsage, turns: number): void {
    const runs = this.runEntries.get(sessionId) ?? new Map<string, Entry>()
    runs.set(runId, {
      usage: { ...usage },
      turns,
    })
    this.runEntries.set(sessionId, runs)
  }

  take(sessionId: string): SessionUsage | null {
    const entry = this.entries.get(sessionId)
    const runs = this.runEntries.get(sessionId)
    if (!entry && !runs) return null

    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    let turns = 0

    if (entry) {
      usage.inputTokens += entry.usage.inputTokens
      usage.outputTokens += entry.usage.outputTokens
      usage.cacheReadTokens += entry.usage.cacheReadTokens
      usage.cacheCreationTokens += entry.usage.cacheCreationTokens
      turns += entry.turns
    }

    for (const run of runs?.values() ?? []) {
      usage.inputTokens += run.usage.inputTokens
      usage.outputTokens += run.usage.outputTokens
      usage.cacheReadTokens += run.usage.cacheReadTokens
      usage.cacheCreationTokens += run.usage.cacheCreationTokens
      turns += run.turns
    }

    this.entries.delete(sessionId)
    this.runEntries.delete(sessionId)
    return { tokenUsage: usage, turns }
  }
}
