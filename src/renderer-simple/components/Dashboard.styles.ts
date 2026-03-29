import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 960,
  margin: '0 auto',
}

export const logoWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginBottom: 24,
}

export const tagline: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  letterSpacing: '0.05em',
  marginTop: 8,
}

export const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 32,
}

export const title: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  flexShrink: 0,
}

export const headerDivider: CSSProperties = {
  flex: 1,
  height: 1,
  background: 'linear-gradient(90deg, rgba(var(--accent-rgb, 200,149,108), 0.3), transparent)',
}

export const headerCount: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  flexShrink: 0,
}

export const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 20,
}

// "New App" card — dashed border, centered content
export const newAppCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  background: 'transparent',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1.5px dashed var(--border)',
  transition: 'border-color 0.2s, background 0.2s',
  minHeight: 140,
}

export const newAppIconCircle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1.5px dashed var(--accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--accent)',
  fontSize: 18,
  opacity: 0.7,
}

export const newAppLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--accent)',
}

// Create dialog (modal overlay)
export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
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
  maxWidth: 520,
  width: '90%',
}

export const dialogTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 8,
}

export const dialogTechRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  marginBottom: 24,
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-muted)',
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
  marginBottom: 20,
}

export const select: CSSProperties = {
  ...input,
  appearance: 'none',
}

export const textarea: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 14,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
  marginBottom: 24,
  minHeight: 100,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
}

export const templateMeta: CSSProperties = {
  marginBottom: 20,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg)',
}

export const templateTitleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 6,
}

export const templateTitleText: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
}

export const templateBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
}

export const templateDescription: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

export const refreshButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

export const statusText: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  color: 'var(--text-muted)',
}

export const errorText: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  color: 'var(--error)',
}

export const buttonRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
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
