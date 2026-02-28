import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export const emptyState: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  fontSize: 16,
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
}

export const spinner: CSSProperties = {
  width: 24,
  height: 24,
  border: '3px solid var(--border)',
  borderTop: '3px solid var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  marginBottom: 12,
}

export const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  color: 'var(--text-muted)',
  gap: 8,
}

export const urlLabel: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'monospace',
}

export const reloadButton: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
}

export const errorContainer: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  color: 'var(--text-muted)',
}

export const retryButton: CSSProperties = {
  padding: '4px 16px',
  fontSize: 12,
  color: '#fff',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
}
