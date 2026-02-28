import type React from 'react'

export const toastStyles: Record<string, React.CSSProperties> = {
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
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '0 12px 10px 12px',
  },
  restartButton: {
    fontSize: '12px',
    fontWeight: 500,
    padding: '5px 14px',
    borderRadius: '4px',
    background: 'var(--btn-bg)',
    color: 'var(--btn-text)',
    cursor: 'pointer',
  },
}
