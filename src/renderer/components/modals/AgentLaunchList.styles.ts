import type React from 'react'

export const launchListStyles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    width: '100%',
  },
  // Geometry only, shared by both kinds of row. The lead row's surface comes
  // from the `.btn-metal` class, and an inline `background`/`color`/`border`
  // here would outrank it — so every surface property lives in `rowPlate`,
  // which the lead row simply doesn't take.
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    width: '100%',
    padding: 'var(--space-md)',
    textAlign: 'left',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  // A console plate: the same rounded silhouette the metal CTA wears, so the
  // lead row and the rows under it read as one family.
  rowPlate: {
    background: 'var(--bg-elevated)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 78%)',
    color: 'var(--text-secondary)',
  },
  rowHover: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
    borderColor: 'color-mix(in srgb, var(--accent), transparent 55%)',
  },
  rowDisabled: {
    opacity: 0.45,
    cursor: 'default',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    flexShrink: 0,
    color: 'inherit',
  },
  monogram: {
    fontSize: 'var(--type-ui)',
    fontWeight: 600,
    color: 'inherit',
  },
  name: {
    flex: 1,
    fontSize: 'var(--type-ui)',
    fontWeight: 500,
    color: 'inherit',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  // On the gold plate, muted grey falls below contrast — the plate's own ink
  // carries the "Starting…" text instead.
  metaOnMetal: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--btn-text)',
    opacity: 0.75,
  },
  chevron: {
    color: 'var(--text-muted)',
    transition: 'transform 0.1s ease',
  },
  // The chat provider picker slides in indented under the Chat row, reading as
  // its children rather than more peers.
  chatPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    paddingLeft: 'var(--space-lg)',
  },
  chatPanelLabel: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    padding: '0 var(--space-xs)',
  },
}
