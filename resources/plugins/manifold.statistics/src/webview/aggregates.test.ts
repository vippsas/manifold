import { describe, it, expect } from 'vitest'
import type { VerdictRecord } from 'manifold'
import {
  computeRuntimeStats,
  computeOutcomeCounts,
  sortRecentFirst,
  computeProjectStats,
} from './aggregates'

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

describe('computeProjectStats', () => {
  it('computes per-repo totals + merge rate, sorted alphabetically by repo name', () => {
    const stats = computeProjectStats([
      { projectId: 'p2', projectName: 'Beta', records: [r({ outcome: 'merged' }), r({ outcome: 'merged' }), r({ outcome: 'pr_created' })] },
      { projectId: 'p1', projectName: 'Alpha', records: [r({ outcome: 'merged' }), r({ outcome: 'discarded' })] },
    ])
    // Alphabetical regardless of session count → Alpha before Beta
    expect(stats.map((s) => s.projectName)).toEqual(['Alpha', 'Beta'])
    expect(stats[0]).toEqual({ projectId: 'p1', projectName: 'Alpha', total: 2, merged: 1, mergedPct: 50 })
    expect(stats[1]).toEqual({ projectId: 'p2', projectName: 'Beta', total: 3, merged: 2, mergedPct: 67 })
  })

  it('returns empty array for no groups', () => {
    expect(computeProjectStats([])).toEqual([])
  })
})

describe('sortRecentFirst', () => {
  it('returns records sorted by createdAt descending', () => {
    const records = [
      r({ sessionId: 'old', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'new', createdAt: '2026-05-16T00:00:00Z' }),
      r({ sessionId: 'mid', createdAt: '2026-05-15T12:00:00Z' }),
    ]
    expect(sortRecentFirst(records).map((rec) => rec.sessionId)).toEqual(['new', 'mid', 'old'])
  })

  it('does not mutate input', () => {
    const records = [
      r({ sessionId: 'a', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'b', createdAt: '2026-05-16T00:00:00Z' }),
    ]
    const before = records.map((rec) => rec.sessionId)
    sortRecentFirst(records)
    expect(records.map((rec) => rec.sessionId)).toEqual(before)
  })
})
