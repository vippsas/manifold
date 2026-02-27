import React, { useState } from 'react'
import * as styles from './NewAppForm.styles'

function Spinner(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}

interface Props {
  onStart: (name: string, description: string) => void
  onCancel: () => void
}

export function NewAppForm({ onStart, onCancel }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !loading

  const handleStart = (): void => {
    if (!canSubmit) return
    setLoading(true)
    onStart(name.trim(), description.trim())
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={styles.title}>Create a new app</div>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 18px',
        marginBottom: 28,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--text-muted)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Tech stack:</span>{' '}
        React + TypeScript &middot; Vite &middot; IndexedDB (Dexie.js) &middot; CSS Modules
      </div>

      <label style={styles.label}>App name</label>
      <input
        style={styles.input}
        placeholder="e.g. customer-feedback"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        autoFocus
      />

      <label style={styles.label}>Describe what you want to build</label>
      <textarea
        style={styles.textarea}
        placeholder="e.g. A simple page where customers can submit feedback with their name and a message. Show a list of recent feedback entries."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={loading}
      />

      <div style={styles.buttonRow}>
        <button style={styles.cancelButton} onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button
          style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }}
          onClick={handleStart}
          disabled={!canSubmit}
        >
          {loading ? <><Spinner /> Setting up project</> : 'Start Building'}
        </button>
      </div>
    </div>
  )
}
