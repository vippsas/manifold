import React, { useState, useCallback, useRef } from 'react'

interface WelcomeDialogProps {
  defaultPath: string
  onConfirm: (storagePath: string) => void
}

export function WelcomeDialog({ defaultPath, onConfirm }: WelcomeDialogProps): React.JSX.Element {
  const [storagePath, setStoragePath] = useState(defaultPath)
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleBrowse = useCallback(async () => {
    const selected = (await window.electronAPI.invoke('projects:open-dialog')) as string | undefined
    if (selected) setStoragePath(selected)
  }, [])

  const handleConfirm = useCallback(() => {
    const trimmed = storagePath.trim()
    if (trimmed) onConfirm(trimmed)
  }, [storagePath, onConfirm])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm()
    },
    [handleConfirm]
  )

  return (
    <div ref={overlayRef} style={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome">
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Welcome to Manifold</span>
        </div>
        <div style={styles.body}>
          <p style={styles.description}>
            Choose where Manifold stores agent worktrees. You can change this later in Settings.
          </p>
          <label style={styles.label}>
            Storage Directory
            <div style={styles.inputRow}>
              <input
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                onKeyDown={handleKeyDown}
                style={styles.input}
                autoFocus
              />
              <button onClick={() => void handleBrowse()} style={styles.browseButton}>
                Browse
              </button>
            </div>
          </label>
        </div>
        <div style={styles.footer}>
          <button
            onClick={handleConfirm}
            style={styles.confirmButton}
            disabled={!storagePath.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '440px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  header: {
    padding: '16px 16px 0',
  },
  title: {
    fontWeight: 600,
    fontSize: '16px',
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  description: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '13px',
  },
  browseButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  confirmButton: {
    padding: '6px 24px',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#ffffff',
    background: 'var(--accent)',
    fontWeight: 500,
    cursor: 'pointer',
  },
}
