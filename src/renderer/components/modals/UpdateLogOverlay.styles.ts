import type React from 'react'
import { createDialogStyles } from '../workbench-style-primitives'

const base = createDialogStyles('1040px')

export const updateLogStyles: Record<string, React.CSSProperties> = {
  ...base,
  panel: {
    ...base.panel,
    maxWidth: '94vw',
    maxHeight: '84vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    ...base.body,
    padding: '0',
    gap: 0,
    flex: 1,
    minHeight: 0,
    background: 'var(--bg-primary)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border)',
    background: 'linear-gradient(180deg, var(--bg-chrome), var(--bg-secondary))',
  },
  toolbarMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  subtitle: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  meta: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  tabButton: {
    ...base.secondaryButton,
  },
  activeTabButton: {
    ...base.primaryButton,
  },
  releaseNotesWrap: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
  },
  releaseNotesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  releaseTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    flexWrap: 'wrap',
  },
  releaseName: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  releaseBadge: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--control-border)',
    background: 'color-mix(in srgb, var(--accent), transparent 90%)',
    color: 'var(--accent)',
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 600,
  },
  markdownWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 'var(--space-xl)',
    background: 'radial-gradient(circle at top right, color-mix(in srgb, var(--accent), transparent 92%), transparent 32%), var(--bg-primary)',
  },
  markdownBody: {
    maxWidth: 760,
    margin: '0 auto',
    color: 'var(--text-primary)',
    lineHeight: 1.65,
    fontSize: 'var(--type-ui)',
  },
  diagnosticsToolbar: {
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    justifyContent: 'flex-end',
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
