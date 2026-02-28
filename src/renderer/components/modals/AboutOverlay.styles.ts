import type React from 'react'

export const aboutStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '320px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
  },
  closeButton: {
    fontSize: '18px',
    color: 'var(--text-secondary)',
    padding: '0 4px',
    lineHeight: 1,
  },
  body: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  appName: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  version: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  author: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginTop: '12px',
  },
  origin: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  closeFooterButton: {
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
  },
}
