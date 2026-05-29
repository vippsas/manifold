import type React from 'react'

export const titleBarStyles: Record<string, React.CSSProperties> = {
  container: {
    height: 38,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    background:
      'linear-gradient(180deg, var(--bg-chrome, var(--bg-secondary)) 0%, var(--bg-chrome-lo, var(--bg-secondary)) 100%)',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    // @ts-expect-error -- Electron-specific CSS property for window dragging
    WebkitAppRegion: 'drag',
  },
  trafficLightSpacer: {
    width: 78,
    flexShrink: 0,
  },
  titleArea: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },
  titleButton: {
    // @ts-expect-error -- Electron-specific CSS property; opt out of window drag
    WebkitAppRegion: 'no-drag',
    maxWidth: '60%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 10px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'text',
    transition: 'background 150ms ease, color 150ms ease',
  },
  titleButtonHover: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  titleInput: {
    // @ts-expect-error -- Electron-specific CSS property; opt out of window drag
    WebkitAppRegion: 'no-drag',
    minWidth: 140,
    maxWidth: '60%',
    background: 'var(--bg-input)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 10px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    textAlign: 'center',
    outline: 'none',
  },
}
