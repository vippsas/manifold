import type React from 'react'

export const contextMenuStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
  },
  menu: {
    position: 'fixed',
    zIndex: 201,
    minWidth: '180px',
    padding: '4px 0',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  separator: {
    height: '1px',
    margin: '4px 8px',
    background: 'var(--border)',
  },
}
