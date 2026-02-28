import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import * as styles from './Dashboard.styles'

interface Props {
  apps: SimpleApp[]
  onNewApp: () => void
  onSelectApp: (app: SimpleApp) => void
  onDeleteApp: (app: SimpleApp) => Promise<void>
}

export function Dashboard({ apps, onNewApp, onSelectApp, onDeleteApp }: Props): React.JSX.Element {
  const [appToDelete, setAppToDelete] = useState<SimpleApp | null>(null)

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
          <div style={{ fontSize: 22, marginBottom: 12 }}>No apps yet</div>
          <div style={{ marginBottom: 24 }}>
            Click &quot;New App&quot; to get started.
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            React + TypeScript &middot; Vite &middot; IndexedDB (Dexie.js) &middot; CSS Modules
          </div>
        </div>
      ) : (
        <div style={styles.grid}>
          {apps.map((app) => (
            <AppCard
              key={app.sessionId}
              app={app}
              onClick={() => onSelectApp(app)}
              onDelete={() => setAppToDelete(app)}
            />
          ))}
        </div>
      )}
      {appToDelete && (
        <ConfirmDialog
          title={`Delete ${appToDelete.name}?`}
          message={`This will remove the app and its files at ${appToDelete.projectPath}. This cannot be undone.`}
          onConfirm={async () => {
            await onDeleteApp(appToDelete)
            setAppToDelete(null)
          }}
          onCancel={() => setAppToDelete(null)}
        />
      )}
    </div>
  )
}
