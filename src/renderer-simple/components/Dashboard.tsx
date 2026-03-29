import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import { CreateAppDialog, type StartAppRequest } from './CreateAppDialog'
import * as styles from './Dashboard.styles'

function ManifoldWordmark(): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 32,
        fontWeight: 200,
        letterSpacing: '0.15em',
        color: 'var(--text-primary, var(--text))',
        opacity: 0.8,
        fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
      }}>
        MANIFOLD
      </div>
      <div style={{
        width: 60,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        margin: '8px auto 0',
        opacity: 0.5,
      }} />
      <div style={styles.tagline}>Build something amazing</div>
    </div>
  )
}

interface Props {
  apps: SimpleApp[]
  onStart: (request: StartAppRequest) => Promise<void>
  onSelectApp: (app: SimpleApp) => void
  onDeleteApp: (app: SimpleApp) => Promise<void>
}

export type { StartAppRequest } from './CreateAppDialog'

export function Dashboard({ apps, onStart, onSelectApp, onDeleteApp }: Props): React.JSX.Element {
  const [showCreate, setShowCreate] = useState(false)
  const [appToDelete, setAppToDelete] = useState<SimpleApp | null>(null)

  return (
    <div style={styles.container}>
      <div style={styles.logoWrap}>
        <ManifoldWordmark />
      </div>

      <div style={styles.header}>
        <div style={styles.title}>My Apps</div>
        <div style={styles.headerDivider} />
        <div style={styles.headerCount}>
          {apps.length} {apps.length === 1 ? 'app' : 'apps'}
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.newAppCard} onClick={() => setShowCreate(true)}>
          <div style={styles.newAppIcon}>+</div>
          <div style={styles.newAppLabel}>New App</div>
          <div style={styles.newAppTechRow}>Templates from your configured provisioners</div>
        </div>

        {apps.map((app) => (
          <AppCard
            key={app.sessionId}
            app={app}
            onClick={() => onSelectApp(app)}
            onDelete={() => setAppToDelete(app)}
          />
        ))}
      </div>

      <CreateAppDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onStart={onStart}
      />

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
