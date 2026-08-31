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

// Geometry only — the surface (plate, border, radius, shadow) and its hover
// come from the `.path-card` class in theme.css, so an inline `background` /
// `border` / `boxShadow` here would outrank the hover rule. The icon sits in an
// accent-tinted disc so the three paths read as one family.
export const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-sm)',
  width: 168,
  padding: 'var(--space-lg) var(--space-md)',
  cursor: 'pointer',
  textAlign: 'center',
  color: 'inherit',
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
