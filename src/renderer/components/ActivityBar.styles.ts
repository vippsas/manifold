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
}
