import React from 'react'
import type { MemoryStats } from '../../../../shared/memory-types'
import { memoryStyles as s } from '../MemoryPanel.styles'
import { formatMemoryTimestamp } from './memory-panel-config'

interface MemoryStatsBarProps {
  stats: MemoryStats
  onClear: () => void
}

export function MemoryStatsBar({ stats, onClear }: MemoryStatsBarProps): React.JSX.Element {
  return (
    <div style={s.statsBar}>
      <span>{stats.totalInteractions} messages</span>
      <span>{stats.totalObservations} observations</span>
      <span>{stats.totalSessions} sessions</span>
      {stats.oldestInteraction && (
        <span>since {formatMemoryTimestamp(stats.oldestInteraction)}</span>
      )}
      <span style={{ marginLeft: 'auto' }}>
        <button type="button" style={s.clearButton} onClick={onClear}>Clear</button>
      </span>
    </div>
  )
}
