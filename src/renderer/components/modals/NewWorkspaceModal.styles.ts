import type { CSSProperties } from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const dialog = createDialogStyles('520px')

export const styles: Record<string, CSSProperties> = {
  ...dialog,
  modal: {
    ...dialog.panel,
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    ...dialog.body,
    overflowY: 'auto',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
  },
  label: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  fieldHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-sm)',
  },
  input: dialog.input,
  inlineButton: {
    minHeight: 'var(--control-height)',
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-sm)',
    cursor: 'pointer',
    fontSize: 'var(--type-ui-small)',
    flexShrink: 0,
  },
  fleetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    maxHeight: 180,
    overflowY: 'auto',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-sm)',
    background: 'var(--control-bg)',
  },
  emptyState: {
    padding: 'var(--space-sm) var(--space-xs)',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
  },
  fleetRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-sm)',
    padding: '6px var(--space-xs)',
    borderRadius: 'var(--radius-sm)',
  },
  fleetRowText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  fleetName: {
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui)',
  },
  fleetPath: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  errorText: dialog.errorText,
  actions: dialog.footer,
  primaryButton: dialog.primaryButton,
  secondaryButton: dialog.secondaryButton,
}
