import type React from 'react'
import { createDialogStyles, dialogPrimitives } from '../workbench-style-primitives'

const base = createDialogStyles('480px')

export const modalStyles: Record<string, React.CSSProperties> = {
  ...base,
  input: {
    ...base.input,
    padding: '0 var(--space-md)',
    fontFamily: 'var(--font-mono)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  subTabBar: {
    display: 'flex',
    gap: 'var(--space-xs)',
    marginBottom: 'var(--space-xs)',
  },
  subTab: {
    minHeight: 'calc(var(--control-height) - 4px)',
    padding: '0 var(--space-md)',
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'var(--control-bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  subTabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-chrome-active)',
    borderColor: 'var(--accent)',
  },
  errorText: dialogPrimitives.errorText,
  infoText: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    margin: 0,
    fontStyle: 'italic',
  },
  advancedToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
}
