import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import * as styles from './StatusBanner.styles'

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Ready',
  scaffolding: 'Setting up project...',
  building: 'Building your app...',
  previewing: 'Preview ready',
  deploying: 'Deploying to Vercel...',
  live: 'Live',
  error: 'Something went wrong',
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'var(--text-muted)',
  scaffolding: 'var(--accent)',
  building: 'var(--accent)',
  previewing: 'var(--success)',
  deploying: 'var(--accent)',
  live: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  status: AppStatus
  isAgentWorking?: boolean
  onBack: () => void
  onDeploy?: () => void
  runtimeLabel?: string
  onDevMode?: () => void
  liveUrl?: string | null
  deployStatus?: AppStatus | null
}

export function StatusBanner({ status, isAgentWorking, onBack, onDeploy, runtimeLabel, onDevMode, liveUrl, deployStatus }: Props): React.JSX.Element {
  const isDeploying = deployStatus === 'deploying'
  const isLive = deployStatus === 'live' && liveUrl
  const deployFailed = deployStatus === 'error'

  const displayStatus = isDeploying ? 'deploying' : isLive ? 'live' : status
  const displayLabel = isLive ? 'Live at' : STATUS_LABELS[displayStatus]
  const displayColor = STATUS_COLORS[displayStatus]

  return (
    <div style={styles.container}>
      <button onClick={onBack} style={styles.backButton}>
        Back
      </button>
      <span style={styles.statusLabel(displayColor)}>
        {isDeploying && <span style={styles.deployingSpinner} />}
        {' '}{displayLabel}
      </span>
      {isLive && liveUrl && (
        <button
          style={styles.liveUrlButton}
          onClick={() => window.open(liveUrl, '_blank')}
          title={liveUrl}
        >
          {liveUrl.replace('https://', '')}
        </button>
      )}
      {runtimeLabel && (
        <div style={styles.runtimeBadge}>
          AI Assistant: {runtimeLabel}
        </div>
      )}
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
      {isLive && liveUrl && (
        <>
          <button
            style={styles.copyButton}
            onClick={() => navigator.clipboard.writeText(liveUrl)}
          >
            Copy URL
          </button>
          <button
            style={styles.openButton}
            onClick={() => window.open(liveUrl, '_blank')}
          >
            Open ↗
          </button>
        </>
      )}
      {isLive && onDeploy && status === 'previewing' && (
        <button onClick={onDeploy} style={styles.deployButton}>
          Redeploy ▲
        </button>
      )}
      {deployFailed && onDeploy && (
        <button onClick={onDeploy} style={styles.retryButton}>
          Retry
        </button>
      )}
      {onDeploy && status === 'previewing' && !isDeploying && !isLive && !deployFailed && (
        <button onClick={onDeploy} style={styles.deployButton} disabled={isDeploying}>
          Deploy ▲
        </button>
      )}
    </div>
  )
}
