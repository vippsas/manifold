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

  take(sessionId: string): SessionUsage | null {
    const entry = this.entries.get(sessionId)
    if (!entry) return null
    this.entries.delete(sessionId)
    return { tokenUsage: entry.usage, turns: entry.turns }
  }
}
