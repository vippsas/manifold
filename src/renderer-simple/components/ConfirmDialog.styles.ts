import type { CSSProperties } from 'react'

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
  maxWidth: 400,
  width: '90%',
}

export const title: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 12,
}

export const message: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
  marginBottom: 24,
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

export const confirmButton: CSSProperties = {
  background: 'var(--error)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
