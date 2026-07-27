import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('520px')

export const newAgentModalStyles: Record<string, React.CSSProperties> = {
  ...base,
  panel: {
    ...base.panel,
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  context: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 400,
  },
  body: {
    ...base.body,
    alignItems: 'center',
    overflowY: 'auto',
  },
}
