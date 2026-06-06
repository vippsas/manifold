import React, { useEffect, useState } from 'react'
import type { LoopConfig, LoopStatus } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { describeMetric } from '../helpers'
import { formatElapsed } from '../run-view'

interface Props {
  status: LoopStatus
  config: LoopConfig
  iterationNumber: number
  onStop: () => void
}

export function LiveRunCard({ status, config, iterationNumber, onStop }: Props): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const maxIter = config.maxIterations ?? '∞'
  const elapsed = status.startedAt ? formatElapsed(now - status.startedAt) : null
  const targets = config.targetGlobs.length ? config.targetGlobs.join(', ') : 'anywhere'

  return (
    <div style={S.liveCard}>
      <div style={S.liveTop}>
        <span style={S.liveDot} aria-hidden="true" />
        <span style={S.liveState}>Running · iteration {iterationNumber} of {maxIter}</span>
        {elapsed && <span style={S.liveTimer}>⏱ {elapsed}</span>}
        <button style={S.secondaryButton} onClick={onStop}>Stop</button>
      </div>
      {status.bestScore !== undefined && (
        <div style={S.liveScores}>
          <span style={S.bestBadge}>best {status.bestScore}</span>
        </div>
      )}
      <div style={S.liveTrack} aria-hidden="true"><div style={S.liveTrackFill} /></div>
      <div style={S.liveMeta}>
        editing {targets} · eval {config.evalCommand || describeMetric(config.metric)} · {config.budgetSeconds}s budget
      </div>
    </div>
  )
}
