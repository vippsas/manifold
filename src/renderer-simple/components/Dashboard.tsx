import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import { techStackIcons } from './tech-stack-icons'
import * as styles from './Dashboard.styles'

function Spinner(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}

function TechIcon({ path, color, size = 12 }: { path: string; color: string; size?: number }): React.JSX.Element {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  )
}

interface Props {
  apps: SimpleApp[]
  onStart: (name: string, description: string) => void
  onSelectApp: (app: SimpleApp) => void
  onDeleteApp: (app: SimpleApp) => Promise<void>
}

export function Dashboard({ apps, onStart, onSelectApp, onDeleteApp }: Props): React.JSX.Element {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [appToDelete, setAppToDelete] = useState<SimpleApp | null>(null)

  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !loading

  const handleStart = (): void => {
    if (!canSubmit) return
    setLoading(true)
    onStart(name.trim(), description.trim())
  }

  const handleCancel = (): void => {
    if (loading) return
    setShowCreate(false)
    setName('')
    setDescription('')
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>My Apps</div>

      <div style={styles.grid}>
        {/* New App card — always first */}
        <div style={styles.newAppCard} onClick={() => setShowCreate(true)}>
          <div style={styles.newAppIcon}>+</div>
          <div style={styles.newAppLabel}>New App</div>
          <div style={styles.newAppTechRow}>
            {techStackIcons.map((tech, i) => (
              <React.Fragment key={tech.label}>
                {i > 0 && <span style={styles.techDot}>&middot;</span>}
                <span style={styles.techItem}>
                  <TechIcon path={tech.path} color={tech.color} />
                  <span>{tech.label}</span>
                </span>
              </React.Fragment>
            ))}
          </div>
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

      {/* Create App Dialog */}
      {showCreate && (
        <div style={styles.overlay} onClick={handleCancel}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>Create a new app</div>
            <div style={styles.dialogTechRow}>
              {techStackIcons.map((tech, i) => (
                <React.Fragment key={tech.label}>
                  {i > 0 && <span style={styles.techDot}>&middot;</span>}
                  <span style={styles.techItem}>
                    <TechIcon path={tech.path} color={tech.color} size={14} />
                    <span>{tech.label}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>

            <label style={styles.fieldLabel}>App name</label>
            <input
              style={styles.input}
              placeholder="e.g. customer-feedback"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoFocus
            />

            <label style={styles.fieldLabel}>Describe what you want to build</label>
            <textarea
              style={styles.textarea}
              placeholder="e.g. A feedback page where customers submit their name and a message. Show a list of recent entries."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />

            <div style={styles.buttonRow}>
              <button style={styles.cancelButton} onClick={handleCancel} disabled={loading}>
                Cancel
              </button>
              <button
                style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }}
                onClick={handleStart}
                disabled={!canSubmit}
              >
                {loading ? <><Spinner /> Setting up...</> : 'Start Building'}
              </button>
            </div>
          </div>
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
