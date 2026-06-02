import React from 'react'

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: 10000,
    width: '300px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    animation: 'toast-slide-up 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 0 12px',
  },
  title: {
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  dismissButton: {
    fontSize: '16px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '4px',
  },
  body: {
    padding: '6px 12px 12px 12px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
}

interface ThemeChangeToastProps {
  mode: 'light' | 'dark'
  onDismiss: () => void
}

export function ThemeChangeToast({ mode, onDismiss }: ThemeChangeToastProps): React.JSX.Element {
  return (
    <div style={styles.container} role="status">
      <div style={styles.header}>
        <span style={styles.title}>{mode === 'light' ? 'Light' : 'Dark'} mode applied</span>
        <button onClick={onDismiss} style={styles.dismissButton} title="Dismiss">
          &times;
        </button>
      </div>
      <div style={styles.body}>
        Takes effect for newly launched agents. The running agent keeps its current colors until you restart it.
      </div>
    </div>
  )
}
