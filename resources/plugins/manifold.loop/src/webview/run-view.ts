// Pure view-logic for the running state: timer formatting, best-iteration
// detection, and score-trend normalization. Kept separate from JSX so it is
// unit-testable (see run-view.test.ts) and reusable by LiveRunCard/ScoreTrend.
import type { LoopIteration, MetricSpec } from '../types'

/** Wall-clock elapsed (ms) → "m:ss". Negatives clamp to 0:00. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** The `index` of the iteration whose commit is the current best, or null. */
export function bestIterationIndex(iterations: LoopIteration[], bestCommitSha: string | undefined): number | null {
  if (!bestCommitSha) return null
  const hit = iterations.find((it) => it.commitSha && it.commitSha === bestCommitSha)
  return hit ? hit.index : null
}

export interface TrendBar {
  index: number
  score: number
  /** Normalized 0.12–1, where taller is always "better" for the metric direction. */
  heightPct: number
  isBest: boolean
  outcome: LoopIteration['outcome']
}

const MIN_BAR = 0.12

/** Build chronological trend bars from scored iterations. Returns [] for <2 scored
 *  iterations so the caller can hide the strip. Bars are normalized so the visually
 *  tallest bar is always the best attempt, regardless of minimize/maximize. */
export function computeTrend(iterations: LoopIteration[], metric: MetricSpec, bestCommitSha: string | undefined): TrendBar[] {
  const scored = iterations
    .filter((it): it is LoopIteration & { score: number } => typeof it.score === 'number')
    .sort((a, b) => a.index - b.index)
  if (scored.length < 2) return []

  const scores = scored.map((it) => it.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min
  const maximize = metric.direction === 'maximize'

  return scored.map((it) => {
    // goodness in 0..1, higher = better for this metric
    const goodness = span === 0 ? 1 : maximize ? (it.score - min) / span : (max - it.score) / span
    const heightPct = MIN_BAR + goodness * (1 - MIN_BAR)
    return {
      index: it.index,
      score: it.score,
      heightPct,
      isBest: !!bestCommitSha && it.commitSha === bestCommitSha,
      outcome: it.outcome,
    }
  })
}
