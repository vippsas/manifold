import React, { useMemo, useState } from 'react'
import type { LoopIteration } from '../../types'
import { loopPanelStyles as S, outcomeColors, outcomeBorder } from '../styles'

export function IterationList({ iterations, bestIndex }: { iterations: LoopIteration[]; bestIndex: number | null }): React.JSX.Element {
  const sorted = useMemo(
    () => [...iterations].sort((a, b) => {
      const aTime = a.finishedAt ?? a.startedAt
      const bTime = b.finishedAt ?? b.startedAt
      if (bTime !== aTime) return bTime - aTime
      return b.index - a.index
    }),
    [iterations],
  )
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div style={S.iterList}>
      {sorted.map((iter) => {
        const colors = outcomeColors[iter.outcome] ?? outcomeColors.failed
        const canExpand = Boolean(iter.judgeOutputTail?.trim())
        const isOpen = expanded === iter.index
        const isBest = bestIndex !== null && iter.index === bestIndex
        return (
          <div key={iter.index} style={S.iterGroup}>
            <div
              style={{
                ...S.iterRow,
                borderLeft: `3px solid ${outcomeBorder[iter.outcome] ?? 'var(--text-muted)'}`,
                ...(isBest ? S.iterRowBest : null),
                ...(canExpand ? S.iterRowClickable : null),
              }}
              onClick={canExpand ? () => setExpanded(isOpen ? null : iter.index) : undefined}
              role={canExpand ? 'button' : undefined}
              tabIndex={canExpand ? 0 : undefined}
            >
              <div style={S.iterIndex}>#{iter.index}</div>
              {isBest && <span style={S.iterStar} title="Best so far">★</span>}
              <span style={{ ...S.iterOutcome, background: colors.bg, color: colors.fg }}>{iter.outcome}</span>
              {iter.score !== undefined && (
                <span style={S.iterScore}>
                  <span style={S.iterScoreLabel}>score</span>
                  <span style={S.iterScoreValue}>{iter.score}</span>
                </span>
              )}
              <span style={S.iterReason}>{iter.errorMessage ?? (iter.commitSha ? iter.commitSha.slice(0, 7) : '')}</span>
              {canExpand && <span style={S.iterToggle}>{isOpen ? '▾' : '▸'} judge</span>}
            </div>
            {canExpand && isOpen && (
              <pre style={S.iterJudgeOutput}>{iter.judgeOutputTail}</pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
