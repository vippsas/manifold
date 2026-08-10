import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GitSyncResult } from '../../../shared/workspace-types'
import { gitSyncFailureDialogStyles as styles } from './GitSyncFailureDialog.styles'

type GitSyncFailure = Extract<GitSyncResult, { ok: false }>

interface GitSyncFailureDialogProps {
  repoName: string
  failure: GitSyncFailure
  onShowCommandOutput: () => void
  onClose: () => void
}

export function GitSyncFailureDialog({
  repoName,
  failure,
  onShowCommandOutput,
  onClose,
}: GitSyncFailureDialogProps): React.JSX.Element {
  const actionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    actionRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const operation = failure.failedCommand === 'pull' ? 'pulling remote changes' : 'pushing local commits'

  return createPortal(
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="git-sync-failure-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 id="git-sync-failure-title" style={styles.title}>Git sync failed</h2>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close Git sync failure">&times;</button>
        </div>
        <div style={styles.body}>
          <WarningGlyph />
          <p style={styles.summary}>Manifold could not finish {operation} for {repoName}.</p>
          <pre style={styles.reason}>{failure.message}</pre>
        </div>
        <div style={styles.footer}>
          <button type="button" style={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button ref={actionRef} type="button" style={styles.primaryButton} onClick={onShowCommandOutput}>
            Show Command Output
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function WarningGlyph(): React.JSX.Element {
  return (
    <svg style={styles.warning} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M22.1 6.4a2.2 2.2 0 0 1 3.8 0l17.2 30.1a2.2 2.2 0 0 1-1.9 3.3H6.8a2.2 2.2 0 0 1-1.9-3.3L22.1 6.4Z" fill="currentColor" />
      <path d="M24 15.2v13.2" stroke="var(--bg-overlay)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="24" cy="34" r="2.2" fill="var(--bg-overlay)" />
    </svg>
  )
}
