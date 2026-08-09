import type React from 'react'

export const tooltipStyles: Record<string, React.CSSProperties> = {
  // Inline-flex so wrapping a 16px icon button in a tooltip does not change the
  // button's own box, and the row's action cluster keeps its flex layout.
  wrap: {
    display: 'inline-flex',
  },
  // Sits below the context menu (z-index 201): a tooltip must never cover the
  // menu its own button just opened. Hidden until the layout effect has clamped
  // it into the viewport, so it never flashes at the unclamped position.
  bubble: {
    position: 'fixed',
    zIndex: 190,
    visibility: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxWidth: '250px',
    padding: '5px 8px',
    background: 'var(--bg-overlay)',
    border: '1px solid var(--overlay-border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-popover)',
    fontFamily: 'var(--font-sans)',
    // The bubble follows the pointer's target, so it must never become one
    // itself — hovering it would otherwise re-trigger the trigger's leave.
    pointerEvents: 'none',
  },
  label: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    lineHeight: 1.3,
  },
  detail: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    lineHeight: 1.35,
  },
}
