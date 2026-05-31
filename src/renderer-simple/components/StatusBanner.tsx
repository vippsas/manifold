import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import * as styles from './StatusBanner.styles'

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Ready',
  scaffolding: 'Setting up project...',
  building: 'Building your app...',
  previewing: 'Ready',
  live: 'Live',
  error: 'Something went wrong',
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'var(--text-muted)',
  scaffolding: 'var(--accent)',
  building: 'var(--accent)',
  previewing: 'var(--success)',
  live: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  status: AppStatus
  isAgentWorking?: boolean
  onBack: () => void
  runtimeLabel?: string
}

export function StatusBanner({ status, onBack, runtimeLabel }: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <button onClick={onBack} style={styles.backButton}>
        Back
      </button>
      <span style={styles.statusLabel(STATUS_COLORS[status])}>
        {' '}{STATUS_LABELS[status]}
      </span>
      {runtimeLabel && (
        <div style={styles.runtimeBadge}>
          AI Assistant: {runtimeLabel}
        </div>
      )}
      <div style={styles.spacer} />
    </div>
  )
}
