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
    position: 'relative',
    display: 'flex',
  },
  message: {
    width: '100%',
    minHeight: 54,
    maxHeight: 200,
    paddingRight: 32,
    lineHeight: 1.4,
    resize: 'none',
    overflowY: 'auto',
  },
  aiButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
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
