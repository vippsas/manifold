import type React from 'react'

export const favoritesStyles: Record<string, React.CSSProperties> = {
  section: {
    padding: '4px 0 2px',
  },
  // The same 22px full-bleed row the workspaces below use — a favorite is a
  // shortcut to one of them, so it has no business being taller or rounder.
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: '22px',
    padding: '0 var(--space-sm) 0 var(--sidebar-indent-workspace)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui)',
    fontWeight: 400,
  },
  rowDragging: {
    opacity: 0.5,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  badge: {
    flexShrink: 0,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
}
