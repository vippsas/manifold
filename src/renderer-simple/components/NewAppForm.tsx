import React, { useState, useEffect } from 'react'
import * as styles from './NewAppForm.styles'

function useAnimatedDots(active: boolean): string {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) { setCount(0); return }
    const id = setInterval(() => setCount(c => (c + 1) % 4), 400)
    return () => clearInterval(id)
  }, [active])
  return '.'.repeat(count)
}

interface Props {
  onStart: (name: string, description: string) => void
  onCancel: () => void
}

export function NewAppForm({ onStart, onCancel }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const dots = useAnimatedDots(loading)

  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !loading

  const handleStart = (): void => {
    if (!canSubmit) return
    setLoading(true)
    onStart(name.trim(), description.trim())
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>Create a new app</div>

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
          {loading ? `Setting up project${dots}` : 'Start Building'}
        </button>
      </div>
    </div>
  )
}
