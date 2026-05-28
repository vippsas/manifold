import React, { useMemo, useState } from 'react'
import type { LoopIteration } from '../../../shared/loop-types'
import { loopPanelStyles as S, outcomeColors } from './LoopPanel.styles'

export function IterationList({ iterations }: { iterations: LoopIteration[] }): React.JSX.Element {
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
        return (
          <div key={iter.index} style={S.iterGroup}>
            <div
              style={{ ...S.iterRow, ...(canExpand ? S.iterRowClickable : null) }}
              onClick={canExpand ? () => setExpanded(isOpen ? null : iter.index) : undefined}
              role={canExpand ? 'button' : undefined}
              tabIndex={canExpand ? 0 : undefined}
            >
              <div style={S.iterIndex}>#{iter.index}</div>
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
