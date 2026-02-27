import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 600,
  margin: '60px auto',
}

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 32,
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 8,
  color: 'var(--text-muted)',
}

export const input: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  marginBottom: 24,
  outline: 'none',
}

export const textarea: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  marginBottom: 24,
  outline: 'none',
  minHeight: 120,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
}

export const buttonRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
}

export const startButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 32px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
}

export const cancelButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '12px 24px',
  fontSize: 16,
  cursor: 'pointer',
}
