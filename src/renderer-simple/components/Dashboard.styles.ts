import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 960,
  margin: '0 auto',
}

export const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 32,
}

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
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
  border: '2px dashed var(--border)',
  transition: 'border-color 0.2s, background 0.2s',
  minHeight: 140,
}

export const newAppIcon: CSSProperties = {
  fontSize: 32,
  lineHeight: 1,
  color: 'var(--text-muted)',
}

export const newAppLabel: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text-muted)',
}

export const newAppTechRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-muted)',
  opacity: 0.7,
}

export const techItem: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

export const techDot: CSSProperties = {
  opacity: 0.4,
}

export const devViewButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius)',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
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
