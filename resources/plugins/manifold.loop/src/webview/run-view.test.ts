import { describe, it, expect } from 'vitest'
import { formatElapsed, bestIterationIndex, computeTrend } from './run-view'
import type { LoopIteration, MetricSpec } from '../types'

const iter = (index: number, score: number | undefined, outcome: LoopIteration['outcome'], commitSha?: string): LoopIteration =>
  ({ index, startedAt: 0, finishedAt: 1, score, outcome, commitSha })

describe('formatElapsed', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(125_000)).toBe('2:05')
  })
  it('clamps negative input to 0:00', () => {
    expect(formatElapsed(-5)).toBe('0:00')
  })
})

describe('bestIterationIndex', () => {
  it('returns the index of the iteration whose commit matches bestCommitSha', () => {
    const iters = [iter(1, 5, 'improved', 'aaa'), iter(2, 8, 'improved', 'bbb')]
    expect(bestIterationIndex(iters, 'bbb')).toBe(2)
  })
  it('returns null when no commit matches or bestCommitSha is missing', () => {
    const iters = [iter(1, 5, 'improved', 'aaa')]
    expect(bestIterationIndex(iters, 'zzz')).toBeNull()
    expect(bestIterationIndex(iters, undefined)).toBeNull()
  })
})

describe('computeTrend', () => {
  const judge: MetricSpec = { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' }
  const timing: MetricSpec = { kind: 'json-path', path: 'p', direction: 'minimize' }

  it('returns [] with fewer than two scored iterations', () => {
    expect(computeTrend([iter(1, 5, 'improved', 'a')], judge, 'a')).toEqual([])
  })
  it('maximize: higher score is the taller bar; best matches bestCommitSha', () => {
    const bars = computeTrend([iter(1, 4, 'improved', 'a'), iter(2, 8, 'improved', 'b')], judge, 'b')
    expect(bars.map((b) => b.index)).toEqual([1, 2])
    expect(bars[1].heightPct).toBeGreaterThan(bars[0].heightPct)
    expect(bars[1].isBest).toBe(true)
    expect(bars[0].isBest).toBe(false)
  })
  it('minimize: lower score is the taller bar', () => {
    const bars = computeTrend([iter(1, 100, 'improved', 'a'), iter(2, 40, 'improved', 'b')], timing, 'b')
    expect(bars[1].heightPct).toBeGreaterThan(bars[0].heightPct)
  })
  it('skips iterations without a score and sorts by index ascending', () => {
    const bars = computeTrend([iter(3, 6, 'improved', 'c'), iter(1, undefined, 'failed'), iter(2, 9, 'improved', 'b')], judge, 'b')
    expect(bars.map((b) => b.index)).toEqual([2, 3])
  })
  it('gives every bar a visible minimum height even at the bottom of the range', () => {
    const bars = computeTrend([iter(1, 0, 'improved', 'a'), iter(2, 10, 'improved', 'b')], judge, 'b')
    expect(bars[0].heightPct).toBeGreaterThanOrEqual(0.12)
    expect(bars[1].heightPct).toBeLessThanOrEqual(1)
  })
})
