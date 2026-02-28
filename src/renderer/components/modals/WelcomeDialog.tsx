import React, { useState, useCallback } from 'react'

interface WelcomeDialogProps {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onComplete: () => void
}

export function WelcomeDialog({ onAddProject, onCloneProject, onComplete }: WelcomeDialogProps): React.JSX.Element {
  const [showClone, setShowClone] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)

  const handleOpenProject = useCallback((): void => {
    onAddProject()
    onComplete()
  }, [onAddProject, onComplete])

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url && !cloning) {
        setCloning(true)
        setCloneError(null)
        try {
          const success = await onCloneProject(url)
          if (success) {
            onComplete()
          } else {
            setCloneError('Clone failed. Check the URL and your access permissions.')
          }
        } finally {
          setCloning(false)
        }
      }
    },
    [cloneUrl, cloning, onCloneProject, onComplete]
  )

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome">
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Manifold</span>
        </div>
        <div style={styles.body}>
          <p style={styles.description}>
            Run multiple AI coding agents in parallel.
            Each works on a different task, in its own branch, simultaneously.
          </p>
          <div style={styles.actions}>
            <button onClick={handleOpenProject} style={styles.primaryButton}>
              Open a local project
            </button>
            <button onClick={() => setShowClone((p) => !p)} style={styles.secondaryButton}>
              Clone a repository
            </button>
          </div>
          {showClone && (
            <>
              <form onSubmit={(e) => void handleCloneSubmit(e)} style={styles.cloneRow}>
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="git@github.com:user/repo.git"
                  style={{ ...styles.input, opacity: cloning ? 0.6 : 1 }}
                  autoFocus
                  disabled={cloning}
                />
                <button
                  type="submit"
                  style={{ ...styles.primaryButton, opacity: !cloneUrl.trim() || cloning ? 0.5 : 1 }}
                  disabled={!cloneUrl.trim() || cloning}
                >
                  {cloning ? 'Cloning...' : 'Clone'}
                </button>
              </form>
              {cloneError && (
                <div style={{ fontSize: 12, color: 'var(--status-error, #f44)' }}>{cloneError}</div>
              )}
            </>
          )}
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
    padding: '24px 24px 0',
    textAlign: 'center',
  },
  title: {
    fontWeight: 600,
    fontSize: '18px',
    color: 'var(--text-primary)',
  },
  body: {
    padding: '16px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  description: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  primaryButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--accent-text)',
    background: 'var(--accent)',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  },
  secondaryButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
  },
  cloneRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
  },
}
