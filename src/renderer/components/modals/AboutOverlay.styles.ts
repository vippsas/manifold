import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('320px')

export const aboutStyles: Record<string, React.CSSProperties> = {
  ...base,
  body: {
    padding: '24px var(--space-lg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-xs)',
  },
  appName: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  version: {
    fontSize: 'var(--type-ui)',
    color: 'var(--text-secondary)',
  },
  author: {
    fontSize: 'var(--type-ui)',
    color: 'var(--text-secondary)',
    marginTop: '12px',
  },
  origin: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
  },
  closeFooterButton: {
    ...base.secondaryButton,
  },
}
