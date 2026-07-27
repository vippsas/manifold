import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentSession, AgentSettingsUpdate, AgentViewMode } from '../../../shared/types'
import { agentSettingsModalStyles as styles } from './AgentSettingsModal.styles'
import { ConfirmDialog } from '../ConfirmDialog'

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

interface AgentSettingsModalProps {
  visible: boolean
  session: AgentSession
  fallbackName: string
  onSave: (settings: AgentSettingsUpdate) => Promise<void> | void
  onClose: () => void
}

export function AgentSettingsModal({ visible, session, fallbackName, onSave, onClose }: AgentSettingsModalProps): React.JSX.Element | null {
  const [name, setName] = useState(session.displayName?.trim() || fallbackName)
  const [runtimeId, setRuntimeId] = useState(session.runtimeId)
  const [viewMode, setViewMode] = useState<AgentViewMode>(session.nonInteractive ? 'chat' : 'terminal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingSettings, setPendingSettings] = useState<AgentSettingsUpdate | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!visible) return
    setName(session.displayName?.trim() || fallbackName)
    setRuntimeId(session.runtimeId)
    setViewMode(session.nonInteractive ? 'chat' : 'terminal')
    setSaving(false)
    setError(null)
    setPendingSettings(null)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [fallbackName, session.displayName, session.nonInteractive, session.runtimeId, visible])

  if (!visible) return null

  const trimmedName = name.trim()
  const saveSettings = (update: AgentSettingsUpdate): void => {
    setSaving(true)
    setError(null)
    Promise.resolve(onSave(update))
      .then(onClose)
      .catch((reason: unknown) => {
        setSaving(false)
        setError(reason instanceof Error ? reason.message : 'Could not update agent settings')
      })
  }

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!trimmedName || saving) return
    const update = { displayName: trimmedName, runtimeId, viewMode }
    const replacesAgent = runtimeId !== session.runtimeId
      || viewMode !== (session.nonInteractive ? 'chat' : 'terminal')
    if (replacesAgent) {
      setPendingSettings(update)
      return
    }
    saveSettings(update)
  }

  const runtimeOptions = Array.from(new Set([session.runtimeId, 'claude', 'codex']))

  return createPortal(
    <div
      ref={overlayRef}
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Agent settings for ${fallbackName}`}
      onClick={(event) => { if (event.target === overlayRef.current) onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
    >
      <form style={styles.panel} onSubmit={handleSubmit}>
        <div style={styles.header}>
          <span style={styles.title}>Agent Settings</span>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close agent settings">&times;</button>
        </div>
        <div style={styles.body}>
          <label style={styles.label}>
            Name
            <input
              ref={inputRef}
              style={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Agent name"
            />
          </label>
          <label style={styles.label}>
            Agent
            <select
              style={styles.select}
              value={runtimeId}
              onChange={(event) => setRuntimeId(event.target.value)}
              aria-label="Agent runtime"
            >
              {runtimeOptions.map((id) => (
                <option key={id} value={id}>{RUNTIME_LABELS[id] ?? id}</option>
              ))}
            </select>
          </label>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>View</legend>
            <div style={styles.modeGrid}>
              <label style={{ ...styles.modeOption, ...(viewMode === 'chat' ? styles.modeOptionSelected : {}) }}>
                <input
                  type="radio"
                  style={styles.radio}
                  name="agent-view"
                  value="chat"
                  checked={viewMode === 'chat'}
                  onChange={() => setViewMode('chat')}
                />
                <span>
                  <strong style={styles.modeTitle}>Chat UI</strong>
                  <span style={styles.modeDescription}>Clean conversation view</span>
                </span>
              </label>
              <label style={{ ...styles.modeOption, ...(viewMode === 'terminal' ? styles.modeOptionSelected : {}) }}>
                <input
                  type="radio"
                  style={styles.radio}
                  name="agent-view"
                  value="terminal"
                  checked={viewMode === 'terminal'}
                  onChange={() => setViewMode('terminal')}
                />
                <span>
                  <strong style={styles.modeTitle}>Terminal</strong>
                  <span style={styles.modeDescription}>Full interactive CLI</span>
                </span>
              </label>
            </div>
          </fieldset>
          <div style={styles.metaGrid}>
            <span style={styles.metaLabel}>Branch</span>
            <span style={styles.metaValue} title={session.branchName}>{session.branchName}</span>
          </div>
          <span style={styles.helpText}>Changing the agent or view starts a fresh agent after confirmation. Previous chat is cleared; the branch, files, and workspace access stay unchanged.</span>
          {error && <span role="alert" style={styles.errorText}>{error}</span>}
        </div>
        <div style={styles.footer}>
          <button type="button" style={styles.cancelButton} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={styles.saveButton} disabled={!trimmedName || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
      {pendingSettings && (
        <ConfirmDialog
          title="Start a new agent?"
          message="Changing the agent or view stops this agent and clears its previous chat. A fresh agent will start with the new setup on the same branch and files."
          confirmLabel="Start New Agent"
          onConfirm={() => {
            const update = pendingSettings
            setPendingSettings(null)
            saveSettings(update)
          }}
          onCancel={() => setPendingSettings(null)}
        />
      )}
    </div>,
    document.body,
  )
}
