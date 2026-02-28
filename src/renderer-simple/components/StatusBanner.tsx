import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import * as styles from './StatusBanner.styles'

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Ready',
  scaffolding: 'Setting up project...',
  building: 'Building your app...',
  previewing: 'Preview ready',
  deploying: 'Deploying...',
  live: 'Live',
  error: 'Something went wrong',
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'var(--text-muted)',
  scaffolding: 'var(--accent)',
  building: 'var(--accent)',
  previewing: 'var(--success)',
  deploying: 'var(--warning)',
  live: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  status: AppStatus
  isAgentWorking?: boolean
  onBack: () => void
  onDeploy?: () => void
  onDevMode?: () => void
}

export function StatusBanner({ status, isAgentWorking, onBack, onDeploy, onDevMode }: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <button onClick={onBack} style={styles.backButton}>
        Back
      </button>
      <span style={styles.statusLabel(STATUS_COLORS[status])}>
        {STATUS_LABELS[status]}
      </span>
      <div style={styles.spacer} />
      {onDevMode && (
        <button
          onClick={isAgentWorking ? undefined : onDevMode}
          disabled={isAgentWorking}
          style={{ ...styles.devModeButton, opacity: isAgentWorking ? 0.4 : 1, cursor: isAgentWorking ? 'not-allowed' : 'pointer' }}
          title={isAgentWorking ? 'Unavailable while app is building' : 'Switch to full developer mode'}
        >
          Developer View
        </button>
      )}
      {onDeploy && status === 'previewing' && (
        <button onClick={onDeploy} style={styles.deployButton}>
          Deploy
        </button>
      )}
    </div>
  )
}
