import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const dialog = createDialogStyles('620px')

export const addRepositoryModalStyles: Record<string, React.CSSProperties> = {
  ...dialog,
  panel: {
    ...dialog.panel,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    ...dialog.body,
    alignItems: 'center',
    overflowY: 'auto',
    padding: 'var(--space-xl) var(--space-lg)',
  },
}
