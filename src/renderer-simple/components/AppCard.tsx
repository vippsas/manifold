import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import * as styles from './AppCard.styles'

function formatRelativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  app: SimpleApp
  onClick: () => void
  onDelete: () => void
}

export function AppCard({ app, onClick, onDelete }: Props): React.JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={styles.card}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button
          style={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete app"
        >
          &#x2715;
        </button>
      )}
      <div style={styles.nameRow}>
        <div style={styles.statusDot(app.status)} />
        <div style={styles.name}>{app.name}</div>
      </div>
      <div style={styles.description}>{app.description || 'No description'}</div>
      <div style={styles.bottomRow}>
        <span style={styles.statusBadge(app.status)}>{app.status}</span>
        <span style={styles.timestamp}>{formatRelativeTime(app.updatedAt)}</span>
      </div>
    </div>
  )
}
