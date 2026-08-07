import type React from 'react'

export const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--type-display)',
  fontWeight: 400,
  color: 'var(--text-primary)',
  letterSpacing: 'var(--tracking-tight)',
  textAlign: 'center',
}

export const headingEmphasisStyle: React.CSSProperties = {
  fontStyle: 'italic',
  fontWeight: 500,
  color: 'var(--accent-hi, var(--text-primary))',
}

export const chooserRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-md)',
  flexWrap: 'wrap',
  justifyContent: 'center',
}

// Card pattern (design skill): elevated surface, subtle lift on hover. The icon
// sits in an accent-tinted disc so the three paths read as one family.
export const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-sm)',
  width: 168,
  padding: 'var(--space-lg) var(--space-md)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-elevated)',
  cursor: 'pointer',
  textAlign: 'center',
  color: 'inherit',
  transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
}

export const cardHoverStyle: React.CSSProperties = {
  transform: 'translateY(-2px)',
  boxShadow: 'var(--shadow-popover)',
  borderColor: 'var(--control-border)',
}

export const cardIconStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 'var(--radius-pill)',
  background: 'var(--accent-subtle)',
  color: 'var(--accent)',
}

export const cardTitleStyle: React.CSSProperties = {
  fontSize: 'var(--type-ui)',
  fontWeight: 600,
  color: 'var(--text-primary)',
}

export const cardSubtitleStyle: React.CSSProperties = {
  fontSize: 'var(--type-ui-small)',
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}

export const focusedColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-lg)',
  width: 480,
  maxWidth: '90%',
}
