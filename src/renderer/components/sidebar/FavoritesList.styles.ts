import type React from 'react'

export const favoritesStyles: Record<string, React.CSSProperties> = {
  section: {
    padding: '4px 0 2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px var(--space-sm)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 600,
  },
  rowDragging: {
    opacity: 0.5,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  glyph: {
    flexShrink: 0,
    width: 14,
    textAlign: 'center' as const,
    opacity: 0.8,
  },
  badge: {
    flexShrink: 0,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
}
