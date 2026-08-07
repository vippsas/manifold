import type React from 'react'
import { dialogPrimitives } from '../workbench-style-primitives'

export const searchModalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    ...dialogPrimitives.overlay,
    // Top-aligned rather than centered: the field lands where the eye already
    // is and the results grow downward without shifting it.
    alignItems: 'flex-start',
    paddingTop: '12vh',
  },
  panel: {
    ...dialogPrimitives.panelBase,
    display: 'flex',
    flexDirection: 'column',
    width: 'min(720px, 92vw)',
    // Caps the panel where the results used to cap themselves; SearchView
    // scrolls its own list inside it.
    maxHeight: '64vh',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    padding: 'var(--space-sm) var(--space-md)',
    borderTop: '1px solid var(--divider)',
    background: 'var(--bg-chrome)',
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  fkbd: {
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '1px 5px',
    marginRight: 4,
  },
}
