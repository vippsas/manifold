import React from 'react'
import type { AppStatus } from '../../shared/simple-types'

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
  onBack: () => void
  onDeploy?: () => void
  onDevMode?: () => void
}

export function StatusBanner({ status, onBack, onDeploy, onDevMode }: Props): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        gap: 12,
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Back
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLORS[status] }}>
        {STATUS_LABELS[status]}
      </span>
      <div style={{ flex: 1 }} />
      {onDevMode && (
        <button
          onClick={onDevMode}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '6px 12px',
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Developer View
        </button>
      )}
      {onDeploy && status === 'previewing' && (
        <button
          onClick={onDeploy}
          style={{
            background: 'var(--success)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Deploy
        </button>
      )}
    </div>
  )
}
