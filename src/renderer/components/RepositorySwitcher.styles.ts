import type React from 'react'

export const repositorySwitcherStyles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    maxWidth: 280,
    height: 24,
    padding: '0 var(--space-sm)',
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-small)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  icon: {
    flexShrink: 0,
    fontSize: '12px',
    opacity: 0.8,
  },
  label: {
    minWidth: 0,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  sublabel: {
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  chevron: {
    flexShrink: 0,
    fontSize: '9px',
    opacity: 0.7,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 1000,
    width: 340,
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--overlay-border, var(--border))',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-overlay)',
    overflow: 'hidden',
  },
  list: {
    minHeight: 0,
    overflowY: 'auto',
    padding: 'var(--space-xs)',
  },
  empty: {
    padding: '14px 12px',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
  },
  footer: {
    flexShrink: 0,
    padding: 'var(--space-xs)',
    borderTop: '1px solid var(--divider, var(--border))',
  },
  newChat: {
    width: '100%',
    textAlign: 'left',
  },
}
