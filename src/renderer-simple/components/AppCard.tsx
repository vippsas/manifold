import React from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import * as styles from './AppCard.styles'

interface Props {
  app: SimpleApp
  onClick: () => void
}

export function AppCard({ app, onClick }: Props): React.JSX.Element {
  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.name}>{app.name}</div>
      <div style={styles.description}>{app.description || 'No description'}</div>
      <span style={styles.statusBadge(app.status)}>{app.status}</span>
    </div>
  )
}
