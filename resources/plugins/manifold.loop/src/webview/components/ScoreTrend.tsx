import React from 'react'
import type { LoopIteration, MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { computeTrend } from '../run-view'

interface Props {
  iterations: LoopIteration[]
  metric: MetricSpec
  bestCommitSha: string | undefined
}

/** Compact bar trend of scores across iterations. Renders nothing until there are at
 *  least two scored iterations (handled by computeTrend returning []). */
export function ScoreTrend({ iterations, metric, bestCommitSha }: Props): React.JSX.Element | null {
  const bars = computeTrend(iterations, metric, bestCommitSha)
  if (bars.length < 2) return null
  const scores = bars.map((b) => b.score)
  return (
    <div style={S.trendCard}>
      <div style={S.trendHead}>
        <span>Score over time</span>
        <span>{Math.min(...scores)} → {Math.max(...scores)}</span>
      </div>
      <div style={S.trendBars}>
        {bars.map((b) => (
          <div
            key={b.index}
            title={`#${b.index}: ${b.score}`}
            style={{
              ...S.trendBar,
              ...(b.outcome === 'regressed' ? S.trendBarRegressed : null),
              ...(b.isBest ? S.trendBarBest : null),
              height: `${Math.round(b.heightPct * 100)}%`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
