import type { CSSProperties } from 'react'

export const menu: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: 220,
  overflowY: 'auto',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
  padding: 4,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
}

export const item: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '6px 8px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
}

export const itemActive: CSSProperties = {
  background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
}

export const name: CSSProperties = {
  fontWeight: 500,
  flexShrink: 0,
}

export const dir: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
