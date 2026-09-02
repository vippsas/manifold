import { describe, it, expect } from 'vitest'
import { estimateCostUsd, rateKey, type CostTokens } from './model-pricing'

function tokens(t: Partial<CostTokens>): CostTokens {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    ...t,
  }
}

const MILLION = 1_000_000

describe('rateKey', () => {
  it('is the bare model id at standard speed', () => {
    expect(rateKey('claude-opus-5', 'standard')).toBe('claude-opus-5')
    expect(rateKey('claude-opus-5', undefined)).toBe('claude-opus-5')
  })

  it('marks fast-mode turns so they price at the premium rate', () => {
    expect(rateKey('claude-opus-5', 'fast')).toBe('claude-opus-5#fast')
  })
})

describe('estimateCostUsd', () => {
  it('prices every token category at the published per-MTok rate', () => {
    // Claude Opus 5: $5 in / $25 out / $0.50 cache read / $6.25 5m write / $10 1h write.
    const r = estimateCostUsd({
      'claude-opus-5': tokens({
        inputTokens: MILLION,
        outputTokens: MILLION,
        cacheReadTokens: MILLION,
        cacheWrite5mTokens: MILLION,
        cacheWrite1hTokens: MILLION,
      }),
    })
    expect(r.usd).toBeCloseTo(46.75, 6)
    expect(r.unpricedModels).toEqual([])
  })

  it('charges 1-hour cache writes at 2x input, not the 1.25x 5-minute rate', () => {
    const write1h = estimateCostUsd({ 'claude-opus-5': tokens({ cacheWrite1hTokens: MILLION }) })
    const write5m = estimateCostUsd({ 'claude-opus-5': tokens({ cacheWrite5mTokens: MILLION }) })
    expect(write1h.usd).toBeCloseTo(10, 6)
    expect(write5m.usd).toBeCloseTo(6.25, 6)
  })

  it('prices fast-mode Opus turns at the premium $10/$50 rate', () => {
    const r = estimateCostUsd({
      'claude-opus-5#fast': tokens({ inputTokens: MILLION, outputTokens: MILLION }),
    })
    expect(r.usd).toBeCloseTo(60, 6)
    expect(r.unpricedModels).toEqual([])
  })

  it('prices a dated model id off its dateless snapshot', () => {
    const r = estimateCostUsd({ 'claude-haiku-4-5-20251001': tokens({ inputTokens: MILLION }) })
    expect(r.usd).toBeCloseTo(1, 6)
    expect(r.unpricedModels).toEqual([])
  })

  it('uses the 0.025x cache-read rate that only Fable 5.1 gets', () => {
    const fable51 = estimateCostUsd({ 'claude-fable-5-1': tokens({ cacheReadTokens: MILLION }) })
    const fable5 = estimateCostUsd({ 'claude-fable-5': tokens({ cacheReadTokens: MILLION }) })
    expect(fable51.usd).toBeCloseTo(0.25, 6)
    expect(fable5.usd).toBeCloseTo(1, 6)
  })

  it('sums across models when a session switched between them', () => {
    const r = estimateCostUsd({
      'claude-opus-5': tokens({ outputTokens: MILLION }),
      'claude-sonnet-5': tokens({ outputTokens: MILLION }),
    })
    expect(r.usd).toBeCloseTo(35, 6)
  })

  it('returns null rather than inventing a price for an unknown model', () => {
    const r = estimateCostUsd({ 'claude-mystery-9': tokens({ inputTokens: MILLION }) })
    expect(r.usd).toBeNull()
    expect(r.unpricedModels).toEqual(['claude-mystery-9'])
  })

  it('reports a partial total and names the model it could not price', () => {
    const r = estimateCostUsd({
      'claude-opus-5': tokens({ outputTokens: MILLION }),
      'claude-mystery-9': tokens({ inputTokens: MILLION }),
    })
    expect(r.usd).toBeCloseTo(25, 6)
    expect(r.unpricedModels).toEqual(['claude-mystery-9'])
  })

  it('ignores zero-token buckets so synthetic entries are not flagged unpriced', () => {
    const r = estimateCostUsd({
      'claude-opus-5': tokens({ outputTokens: MILLION }),
      '<synthetic>': tokens({}),
    })
    expect(r.usd).toBeCloseTo(25, 6)
    expect(r.unpricedModels).toEqual([])
  })

  it('has nothing to price for an empty session', () => {
    expect(estimateCostUsd({})).toEqual({ usd: null, unpricedModels: [], rows: [] })
  })
})

describe('estimateCostUsd rows', () => {
  it('returns one row per bucket, with a readable model name', () => {
    const { rows } = estimateCostUsd({
      'claude-opus-5': tokens({ inputTokens: 2, outputTokens: 43, cacheReadTokens: 14_299, cacheWrite1hTokens: 15_901 }),
    })
    expect(rows).toEqual([{
      model: 'Opus 5',
      inputTokens: 2,
      outputTokens: 43,
      cacheReadTokens: 14_299,
      cacheWriteTokens: 15_901,
      costUsd: expect.closeTo(0.1672445, 9),
    }])
  })

  it('names a dated snapshot by its family, not its raw id', () => {
    const { rows } = estimateCostUsd({ 'claude-haiku-4-5-20251001': tokens({ outputTokens: 127 }) })
    expect(rows[0].model).toBe('Haiku 4.5')
  })

  it('marks a fast-mode bucket so it is not confused with the standard rate', () => {
    const { rows } = estimateCostUsd({ 'claude-opus-5#fast': tokens({ outputTokens: 100 }) })
    expect(rows[0].model).toBe('Opus 5 (fast)')
  })

  it('keeps an unknown model as a row, with tokens but no cost', () => {
    const { rows } = estimateCostUsd({ 'claude-mystery-9': tokens({ outputTokens: 500 }) })
    expect(rows).toEqual([{
      model: 'claude-mystery-9',
      inputTokens: 0,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: null,
    }])
  })

  it('sums 5m and 1h writes into one cache-write figure for display', () => {
    const { rows } = estimateCostUsd({
      'claude-opus-5': tokens({ cacheWrite5mTokens: 7, cacheWrite1hTokens: 100 }),
    })
    expect(rows[0].cacheWriteTokens).toBe(107)
  })

  it('puts the most expensive model first so the cost driver leads', () => {
    const { rows } = estimateCostUsd({
      'claude-haiku-4-5': tokens({ outputTokens: 1_000_000 }),  // $5
      'claude-opus-5': tokens({ outputTokens: 1_000_000 }),     // $25
      'claude-mystery-9': tokens({ outputTokens: 10 }),         // unpriced
    })
    expect(rows.map(r => r.model)).toEqual(['Opus 5', 'Haiku 4.5', 'claude-mystery-9'])
  })

  it('has no rows for an empty session', () => {
    expect(estimateCostUsd({}).rows).toEqual([])
  })
})
