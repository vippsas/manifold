import { describe, it, expect } from 'vitest'
import {
  computeRuntimeStats,
  computeOutcomeCounts,
  sortRecentFirst,
} from './verdict-aggregates'
import type { VerdictRecord } from '../../../shared/verdict-types'

function r(overrides: Partial<VerdictRecord>): VerdictRecord {
  return {
    sessionId: 's',
    projectId: 'p',
    branch: 'b',
    runtime: 'claude',
    taskPrompt: { kind: 'full', text: 't' },
    outcome: 'merged',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('computeRuntimeStats', () => {
  it('groups records by runtime and counts outcomes', () => {
    const records = [
      r({ sessionId: '1', runtime: 'claude', outcome: 'merged' }),
      r({ sessionId: '2', runtime: 'claude', outcome: 'merged' }),
      r({ sessionId: '3', runtime: 'claude', outcome: 'discarded' }),
      r({ sessionId: '4', runtime: 'codex', outcome: 'merged' }),
    ]
    const stats = computeRuntimeStats(records)
    const claude = stats.find((s) => s.runtime === 'claude')!
    const codex = stats.find((s) => s.runtime === 'codex')!
    expect(claude.total).toBe(3)
    expect(claude.merged).toBe(2)
    expect(claude.discarded).toBe(1)
    expect(claude.mergedPct).toBe(67)
    expect(claude.discardedPct).toBe(33)
    expect(codex.total).toBe(1)
    expect(codex.mergedPct).toBe(100)
  })

  it('returns avgHumanEditsForMerged averaged only across merged records', () => {
    const records = [
      r({ sessionId: '1', runtime: 'claude', outcome: 'merged', metrics: { agentCommits: 0, humanEdits: 4, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
      r({ sessionId: '2', runtime: 'claude', outcome: 'merged', metrics: { agentCommits: 0, humanEdits: 2, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
      r({ sessionId: '3', runtime: 'claude', outcome: 'discarded', metrics: { agentCommits: 0, humanEdits: 99, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
    ]
    const stats = computeRuntimeStats(records)
    expect(stats[0].avgHumanEditsForMerged).toBe(3)
  })

  it('returns 0 avg when no merged records', () => {
    const records = [r({ outcome: 'discarded' })]
    const stats = computeRuntimeStats(records)
    expect(stats[0].avgHumanEditsForMerged).toBe(0)
  })

  it('returns empty array for empty input', () => {
    expect(computeRuntimeStats([])).toEqual([])
  })

  it('sorts runtimes alphabetically', () => {
    const records = [
      r({ runtime: 'gemini' }),
      r({ runtime: 'claude' }),
      r({ runtime: 'codex' }),
    ]
    expect(computeRuntimeStats(records).map((s) => s.runtime)).toEqual(['claude', 'codex', 'gemini'])
  })
})

describe('computeOutcomeCounts', () => {
  it('counts each outcome category', () => {
    const records = [
      r({ outcome: 'merged' }),
      r({ outcome: 'merged' }),
      r({ outcome: 'pr_created' }),
      r({ outcome: 'committed_only' }),
      r({ outcome: 'discarded' }),
      r({ outcome: 'unknown' }),
    ]
    expect(computeOutcomeCounts(records)).toEqual({
      merged: 2,
      pr_created: 1,
      committed_only: 1,
      discarded: 1,
      unknown: 1,
    })
  })

  it('returns all zeros for empty input', () => {
    expect(computeOutcomeCounts([])).toEqual({
      merged: 0, pr_created: 0, committed_only: 0, discarded: 0, unknown: 0,
    })
  })
})

describe('sortRecentFirst', () => {
  it('returns records sorted by createdAt descending', () => {
    const records = [
      r({ sessionId: 'old', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'new', createdAt: '2026-05-16T00:00:00Z' }),
      r({ sessionId: 'mid', createdAt: '2026-05-15T12:00:00Z' }),
    ]
    expect(sortRecentFirst(records).map((r) => r.sessionId)).toEqual(['new', 'mid', 'old'])
  })

  it('does not mutate input', () => {
    const records = [
      r({ sessionId: 'a', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'b', createdAt: '2026-05-16T00:00:00Z' }),
    ]
    const before = records.map((r) => r.sessionId)
    sortRecentFirst(records)
    expect(records.map((r) => r.sessionId)).toEqual(before)
  })
})
