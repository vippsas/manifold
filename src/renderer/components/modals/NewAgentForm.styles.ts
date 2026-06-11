import type React from 'react'

export const modeToggleStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-md)',
    marginTop: 'var(--space-xs)',
  } as React.CSSProperties,
  track: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-pill)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
  } as React.CSSProperties,
  segment: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    padding: '5px 18px',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 500,
    letterSpacing: '0.01em',
    cursor: 'pointer',
    transition: 'background var(--duration-normal) var(--ease-premium), color var(--duration-normal) var(--ease-premium)',
  } as React.CSSProperties,
  segmentActive: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    boxShadow: 'inset 0 0 0 1px var(--accent-subtle)',
  } as React.CSSProperties,
  segmentHover: {
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
}

export const onboardingLinkStyle = (hover: boolean): React.CSSProperties => ({
  marginTop: 'var(--space-xs)',
  padding: '6px 14px',
  fontSize: 'var(--type-ui-small)',
  fontWeight: 500,
  color: hover ? 'var(--text-primary)' : 'var(--text-muted)',
  background: hover ? 'var(--list-hover-bg)' : 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'color var(--duration-normal) var(--ease-premium), background var(--duration-normal) var(--ease-premium)',
})

// Layout only — the metallic surface comes from the shared .btn-metal class.
export const startButtonStyle = (canSubmit: boolean, loading: boolean): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 32px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--type-ui)',
  cursor: canSubmit && !loading ? 'pointer' : 'default',
  opacity: canSubmit && !loading ? 1 : 0.5,
})
