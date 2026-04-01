import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg)',
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
  background: 'var(--surface)',
}

export const urlLabel: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'monospace',
}

export const toolbarActions: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

export const toolbarButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 28,
  height: 24,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
  padding: '0 6px',
  transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
}

export const toolbarButtonDisabled: CSSProperties = {
  ...toolbarButton,
  color: 'var(--text-muted)',
  cursor: 'default',
  opacity: 0.5,
}

export const loadingLabel: CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
}

export const webview: CSSProperties = {
  flex: 1,
  border: 'none',
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
  color: 'var(--btn-text)',
  background: 'var(--btn-bg)',
  border: 'none',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
}
