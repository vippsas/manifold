import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  position: 'relative',
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

export const runtimeBadge: CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

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
