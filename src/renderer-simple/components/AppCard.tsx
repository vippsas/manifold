import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import * as styles from './AppCard.styles'

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
      <div style={styles.name}>{app.name}</div>
      <div style={styles.description}>{app.description || 'No description'}</div>
      <span style={styles.statusBadge(app.status)}>{app.status}</span>
    </div>
  )
}
