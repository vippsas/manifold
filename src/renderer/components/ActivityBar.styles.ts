import type React from 'react'

export const activityBarStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '44px',
    padding: 'var(--space-sm) 0',
    background: 'var(--bg-chrome)',
    borderRight: '1px solid var(--border)',
    flexShrink: 0,
    position: 'relative',
    // The rail must paint above the dock so its hover tooltips overlay the panels.
    zIndex: 100,
  },
  // Pushes the settings item to the bottom of the rail.
  spacer: {
    flex: 1,
  },
  // Separates the sidebar views above from the main-area panel toggles below:
  // the two groups answer different questions ("what does the sidebar show" vs
  // "is this panel open"), so they shouldn't read as one list.
  divider: {
    width: '20px',
    height: '1px',
    margin: 'var(--space-xs) 0',
    background: 'var(--border)',
    flexShrink: 0,
  },
  changeBadge: {
    position: 'absolute',
    top: -3,
    right: -4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 15,
    height: 15,
    padding: '0 3px',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    boxShadow: '0 0 0 1px var(--bg-chrome)',
    fontSize: 'var(--type-ui-micro)',
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: 'none',
  },
}
