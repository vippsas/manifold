import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('960px')

export const updateLogStyles: Record<string, React.CSSProperties> = {
  ...base,
  panel: {
    ...base.panel,
    maxWidth: '92vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    ...base.body,
    padding: '0',
    gap: 0,
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  subtitle: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  logWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    background: 'var(--bg-primary)',
    padding: 'var(--space-lg)',
  },
  logText: {
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  error: {
    color: 'var(--error)',
    padding: 'var(--space-md) var(--space-lg)',
    borderTop: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--error), transparent 94%)',
    fontSize: 'var(--type-ui-small)',
  },
  closeFooterButton: {
    ...base.secondaryButton,
  },
  refreshButton: {
    ...base.secondaryButton,
  },
  cleanButton: {
    ...base.secondaryButton,
  },
  checkButton: {
    ...base.primaryButton,
  },
}
