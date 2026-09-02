import type React from 'react'

export const runBoardStyles: Record<string, React.CSSProperties> = {
  board: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    margin: '0 0 var(--space-md) 0',
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-sm)',
    padding: 'var(--space-xs) var(--space-sm)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui-small)',
  },
  // The status colour is the row's only decoration, and it carries state.
  marker: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 'var(--radius-xs)',
    flexShrink: 0,
  },
  title: {
    color: 'var(--text-primary)',
    fontWeight: 500,
    flexShrink: 0,
  },
  openButton: {
    all: 'unset',
    color: 'var(--text-primary)',
    fontWeight: 500,
    fontSize: 'var(--type-ui-small)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-xs)',
    transition: 'color 150ms ease',
  },
  step: {
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  worker: {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    flexShrink: 0,
  },
  elapsed: {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  detail: {
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
}
