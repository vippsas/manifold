import type React from 'react'
import { createDialogStyles, dialogPrimitives } from '../workbench-style-primitives'
import { chooserRowStyle, headingStyle } from '../sidebar/NoProjectActions.styles'

const dialog = createDialogStyles('620px')

export const addRepositoryModalStyles: Record<string, React.CSSProperties> = {
  ...dialog,
  destinationHeading: {
    ...headingStyle,
    margin: '0 0 var(--space-md)',
  },
  destinationCards: chooserRowStyle,
  destinationSummary: {
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    minWidth: 0,
  },
  backButton: {
    ...dialogPrimitives.tertiaryButton,
    color: 'var(--accent)',
    fontSize: 'var(--type-ui-small)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  destinationName: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
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
