import type React from 'react'

export const modePillStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  } as React.CSSProperties,
  button: {
    background: 'transparent',
    border: 'none',
    padding: '2px 6px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.02em',
    transition: 'color var(--duration-normal) var(--ease-premium)',
  } as React.CSSProperties,
  buttonActive: {
    color: 'var(--accent)',
  } as React.CSSProperties,
  separator: {
    color: 'var(--text-muted)',
    fontSize: 11,
    opacity: 0.5,
    userSelect: 'none' as const,
  } as React.CSSProperties,
}

export const startButtonStyle = (canSubmit: boolean, loading: boolean): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 32px',
  background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
  color: 'var(--btn-text)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--type-ui)',
  fontWeight: 500,
  cursor: canSubmit && !loading ? 'pointer' : 'default',
  letterSpacing: '0.02em',
  boxShadow: 'var(--shadow-glow, var(--shadow-subtle))',
  transition: 'filter var(--duration-normal) var(--ease-premium)',
  opacity: canSubmit && !loading ? 1 : 0.5,
})
