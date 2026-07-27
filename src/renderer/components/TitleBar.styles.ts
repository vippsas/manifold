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
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '30%',
  },
  // Equal-width flanks so the search column lands at the true window center,
  // regardless of how wide the title on the left is.
  leftGroup: {
    flex: '1 1 0',
    minWidth: 'var(--space-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rightGroup: {
    flex: '1 1 0',
    minWidth: 'var(--space-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },
}
