import React from 'react'
import type { WorkingSetNotice } from './types'

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 'var(--space-md)',
    right: 'var(--space-md)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    alignItems: 'flex-end',
  },
  toast: {
    width: '320px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-overlay)',
    overflow: 'hidden',
    animation: 'toast-slide-up 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-sm) var(--space-sm) 0 var(--space-sm)',
  },
  title: {
    fontWeight: 600,
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
  },
  dismissButton: {
    fontSize: 'var(--type-ui)',
    lineHeight: 1,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0 var(--space-xs)',
    borderRadius: 'var(--radius-xs)',
    background: 'none',
    border: 'none',
  },
  body: {
    padding: 'var(--space-xs) var(--space-sm) var(--space-sm) var(--space-sm)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  command: {
    display: 'block',
    marginTop: 'var(--space-xs)',
    padding: '2px var(--space-xs)',
    borderRadius: 'var(--radius-xs)',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-micro)',
    wordBreak: 'break-all',
  },
}

function folderName(dir: string): string {
  return dir.split('/').filter(Boolean).pop() ?? dir
}

function title(notice: WorkingSetNotice): string {
  return notice.delivery === 'manual' || notice.delivery === 'not-added'
    ? `Couldn’t add ${folderName(notice.dir)}`
    : `${folderName(notice.dir)} added`
}

function body(notice: WorkingSetNotice): React.ReactNode {
  switch (notice.delivery) {
    case 'not-added':
      return notice.error
    case 'next-turn':
      return `${notice.agentName} picks it up on your next message.`
    case 'restart-required':
      return `${notice.agentName} only takes folders when it starts. Restart it to give it ${folderName(notice.dir)}.`
    default:
      return (
        <>
          {`${notice.agentName} was not reachable — ${notice.error}. Type this in it, or restart it:`}
          <code style={styles.command}>{notice.command}</code>
        </>
      )
  }
}

interface WorkingSetToastProps {
  notices: WorkingSetNotice[]
  onDismiss: (sessionId: string, dir: string) => void
}

/** Reports folders that did not arrive where the user asked for them: one a
 *  workspace's running agents could not be given automatically, or one that
 *  never joined the workspace at all. An agent that took the folder cleanly
 *  says nothing. */
export function WorkingSetToast({ notices, onDismiss }: WorkingSetToastProps): React.JSX.Element | null {
  if (notices.length === 0) return null
  return (
    <div style={styles.container}>
      {notices.map((notice) => (
        <div key={`${notice.sessionId}:${notice.dir}`} style={styles.toast} role="status">
          <div style={styles.header}>
            <span style={styles.title}>{title(notice)}</span>
            <button
              onClick={() => onDismiss(notice.sessionId, notice.dir)}
              style={styles.dismissButton}
              title="Dismiss"
            >
              &times;
            </button>
          </div>
          <div style={styles.body}>{body(notice)}</div>
        </div>
      ))}
    </div>
  )
}
