import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.5))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

export const dialog: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 560,
  width: '92%',
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-overlay)',
}

export const dialogTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 8,
}

export const helperText: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-muted)',
  marginBottom: 20,
}

export const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 6,
}

export const input: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 14,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
  marginBottom: 12,
}

export const select: CSSProperties = {
  ...input,
  appearance: 'none',
}

export const textarea: CSSProperties = {
  ...input,
  minHeight: 100,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
}

export const helpText: CSSProperties = {
  marginTop: -6,
  marginBottom: 12,
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
}

export const metaCard: CSSProperties = {
  marginBottom: 20,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg)',
}

export const metaTitleRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
}

export const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
}

export const provisionerBadge: CSSProperties = {
  ...badge,
  color: 'var(--accent)',
  borderColor: 'var(--accent)',
}

export const metaDescription: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

export const statusText: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  color: 'var(--text-muted)',
}

export const errorText: CSSProperties = {
  marginTop: 8,
  marginBottom: 12,
  fontSize: 12,
  color: 'var(--error)',
}

export const buttonRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
}

export const actionButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

export const cancelButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px 20px',
  fontSize: 14,
  cursor: 'pointer',
}

export const startButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--btn-bg)',
  color: 'var(--btn-text)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
