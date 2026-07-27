import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('420px')

export const agentSettingsModalStyles: Record<string, React.CSSProperties> = {
  ...base,
  fieldset: {
    margin: 0,
    padding: 0,
    border: 0,
  },
  legend: {
    marginBottom: 'var(--space-sm)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 500,
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-sm)',
  },
  modeOption: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-sm)',
    padding: 'var(--space-md)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  modeOptionSelected: {
    borderColor: 'var(--accent)',
    background: 'var(--accent-subtle)',
  },
  radio: {
    accentColor: 'var(--accent)',
  },
  modeTitle: {
    display: 'block',
    marginBottom: '2px',
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui-small)',
  },
  modeDescription: {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.35,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: '96px minmax(0, 1fr)',
    gap: 'var(--space-sm) var(--space-md)',
    padding: 'var(--space-md)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
  },
  metaLabel: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
  },
  metaValue: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-caption)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
