import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import { CreateAppDialog, type StartAppRequest } from './CreateAppDialog'
import * as styles from './Dashboard.styles'

const LOGO = `  .--.      __  ___            _ ____      __    __
 / oo \\    /  |/  /___ _____  (_) __/___  / /___/ /
| \\__/ |  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 \\    /  / /  / / /_/ / / / / / __/ /_/ / / /_/ /
  \\__/  /_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

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
        <pre style={styles.logo}>{LOGO}</pre>
      </div>

      <div style={styles.header}>
        <div style={styles.title}>My Apps</div>
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
