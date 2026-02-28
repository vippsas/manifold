import type { CSSProperties } from 'react'

export const card: CSSProperties = {
  position: 'relative',
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  transition: 'border-color 0.2s',
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

export const name: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 8,
}

export const description: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted)',
  marginBottom: 16,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const statusBadge = (status: string): CSSProperties => ({
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 20,
  background:
    status === 'live' ? 'var(--success)' : status === 'error' ? 'var(--error)' : 'var(--accent)',
  color:
    status === 'live' ? '#fff' : status === 'error' ? '#fff' : 'var(--accent-text)',
})
