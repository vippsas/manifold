import type { CSSProperties } from 'react'

export const card: CSSProperties = {
  position: 'relative',
  background: 'rgba(255, 255, 255, 0.04)',
  borderRadius: 'var(--radius)',
  padding: 20,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-elevated)',
  transition: 'border-color 0.2s',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 120,
}

export const deleteButton: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--error)',
  color: '#fff',
  border: 'none',
  borderRadius: '50%',
  fontSize: 14,
  cursor: 'pointer',
  lineHeight: 1,
}

export const nameRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
}

export const statusDot = (status: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  background:
    status === 'live' || status === 'previewing'
      ? 'var(--success)'
      : status === 'error'
        ? 'var(--error)'
        : status === 'idle'
          ? 'var(--text-muted)'
          : 'var(--accent)',
})

export const name: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const description: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-muted)',
  marginBottom: 16,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}

export const bottomRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

export const statusBadge = (status: string): CSSProperties => {
  const color =
    status === 'live'
      ? 'var(--success)'
      : status === 'error'
        ? 'var(--error)'
        : 'var(--accent)'
  return {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 12,
    background:
      status === 'live'
        ? 'rgba(74, 222, 128, 0.12)'
        : status === 'error'
          ? 'rgba(248, 113, 113, 0.12)'
          : 'rgba(var(--accent-rgb, 200,149,108), 0.12)',
    color,
  }
}

export const timestamp: CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  opacity: 0.7,
}
