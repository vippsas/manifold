import type React from 'react'

export const launchListStyles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    width: '100%',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    width: '100%',
    padding: 'var(--space-md)',
    textAlign: 'left',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  rowHover: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
    borderColor: 'var(--control-border)',
  },
  rowDisabled: {
    opacity: 0.45,
    cursor: 'default',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    flexShrink: 0,
    color: 'inherit',
  },
  monogram: {
    fontSize: 'var(--type-ui)',
    fontWeight: 600,
    color: 'inherit',
  },
  name: {
    flex: 1,
    fontSize: 'var(--type-ui)',
    fontWeight: 500,
    color: 'inherit',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  chevron: {
    color: 'var(--text-muted)',
    transition: 'transform 0.1s ease',
  },
  // The chat provider picker slides in indented under the Chat row, reading as
  // its children rather than more peers.
  chatPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    paddingLeft: 'var(--space-lg)',
  },
  chatPanelLabel: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    padding: '0 var(--space-xs)',
  },
}
