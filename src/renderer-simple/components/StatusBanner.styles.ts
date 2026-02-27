import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border)',
  gap: 12,
}

export const backButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
}

export const statusLabel = (color: string): CSSProperties => ({
  fontSize: 13,
  fontWeight: 600,
  color,
})

export const spacer: CSSProperties = { flex: 1 }

export const devModeButton: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '6px 12px',
  fontSize: 12,
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

export const deployButton: CSSProperties = {
  background: 'var(--success)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
