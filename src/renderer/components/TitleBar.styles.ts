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
}
