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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    // @ts-expect-error -- Electron-specific CSS property to make button clickable in drag region
    WebkitAppRegion: 'no-drag',
  },
  buttonIcon: {
    fontSize: 13,
  },
}
