import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const dialog = createDialogStyles('440px')

export const gitSyncFailureDialogStyles: Record<string, React.CSSProperties> = {
  ...dialog,
  panel: {
    ...dialog.panel,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    ...dialog.body,
    overflowY: 'auto',
  },
  warning: {
    width: 46,
    height: 46,
    color: 'var(--warning)',
    filter: 'drop-shadow(0 0 12px var(--warning-subtle))',
  },
  summary: {
    margin: 0,
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui)',
    fontWeight: 600,
    lineHeight: 1.45,
  },
  reason: {
    margin: 0,
    padding: 'var(--space-sm) var(--space-md)',
    color: 'var(--text-secondary)',
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-small)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: 150,
    overflowY: 'auto',
  },
}
