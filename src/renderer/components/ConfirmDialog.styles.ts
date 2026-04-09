import type React from 'react'

export const confirmDialogStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.5))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 32,
    maxWidth: 400,
    width: '90%',
    boxShadow: 'var(--shadow-overlay)',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: 24,
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 20px',
    fontSize: 14,
    cursor: 'pointer',
  },
  confirmButton: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
