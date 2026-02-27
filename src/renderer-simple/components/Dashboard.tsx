import React from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import * as styles from './Dashboard.styles'

interface Props {
  apps: SimpleApp[]
  onNewApp: () => void
  onSelectApp: (app: SimpleApp) => void
}

export function Dashboard({ apps, onNewApp, onSelectApp }: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>My Apps</div>
        <button style={styles.newButton} onClick={onNewApp}>
          New App
        </button>
      </div>
      {apps.length === 0 ? (
        <div style={styles.emptyState}>
          No apps yet. Click &quot;New App&quot; to get started.
        </div>
      ) : (
        <div style={styles.grid}>
          {apps.map((app) => (
            <AppCard key={app.sessionId} app={app} onClick={() => onSelectApp(app)} />
          ))}
        </div>
      )}
    </div>
  )
}
