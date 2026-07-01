import type React from 'react'

export const sourceControlStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: 'var(--bg-primary)',
  },
  commitBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    padding: 'var(--space-xs) var(--space-sm)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-xs)',
  },
  message: {
    flex: 1,
    minWidth: 0,
    resize: 'none',
  },
  aiButton: {
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  commitButton: {
    width: '100%',
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
  },
}
