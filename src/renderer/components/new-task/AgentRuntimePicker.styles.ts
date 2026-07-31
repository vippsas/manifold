import type React from 'react'

export const runtimePickerStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
  },
  label: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-sm)',
  },
  // Tiles share the row evenly but stop growing, so a machine with one runtime
  // installed gets a tile rather than one button the width of the form.
  tile: {
    flex: '1 1 0',
    minWidth: 84,
    maxWidth: 150,
    minHeight: 78,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 'var(--space-sm) var(--space-xs)',
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background var(--duration-normal) var(--ease-premium), color var(--duration-normal) var(--ease-premium), box-shadow var(--duration-normal) var(--ease-premium)',
  },
  // The monogram carries the tile, so it takes the display serif of the title
  // above it rather than the UI sans of the controls below.
  monogram: {
    fontFamily: 'var(--font-display)',
    fontSize: '30px',
    lineHeight: 1.1,
    fontWeight: 400,
    letterSpacing: 'var(--tracking-tight)',
  },
  name: {
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },
  tileHover: {
    background: 'var(--control-bg-hover)',
    color: 'var(--text-secondary)',
  },
  tileSelected: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    boxShadow: 'inset 0 0 0 1px var(--accent-subtle)',
  },
  tileMissing: {
    opacity: 0.55,
  },
  missing: {
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--status-error)',
  },
}
