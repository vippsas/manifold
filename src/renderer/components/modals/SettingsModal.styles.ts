import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('380px')

export const modalStyles: Record<string, React.CSSProperties> = {
  ...base,
  themeButton: {
    width: '100%',
    minHeight: 'var(--control-height)',
    padding: '0 var(--space-sm)',
    fontSize: 'var(--type-ui)',
    textAlign: 'left' as const,
    background: 'var(--control-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  pickerOverlay: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    zIndex: 1001,
    marginTop: '4px',
  },
}
