import { describe, it, expect } from 'vitest'
import { SessionUsageAccumulator } from './session-usage-accumulator'

describe('SessionUsageAccumulator', () => {
  it('accumulates usage across turns and counts each turn', () => {
    const acc = new SessionUsageAccumulator()
    acc.recordTurn('s1', { inputTokens: 100, outputTokens: 10 })
    acc.recordTurn('s1', { inputTokens: 50, outputTokens: 5, cacheReadTokens: 3 })
    expect(acc.take('s1')).toEqual({
      tokenUsage: { inputTokens: 150, outputTokens: 15, cacheReadTokens: 3, cacheCreationTokens: 0 },
      turns: 2,
    })
  })

  it('take() clears the session and returns null on the second call', () => {
    const acc = new SessionUsageAccumulator()
    acc.recordTurn('s1', { inputTokens: 1 })
    expect(acc.take('s1')).not.toBeNull()
    expect(acc.take('s1')).toBeNull()
  })

  it('returns null for an unknown session', () => {
    expect(new SessionUsageAccumulator().take('nope')).toBeNull()
  })
})
