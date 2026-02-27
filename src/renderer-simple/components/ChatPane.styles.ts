import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export const messages: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 20,
}

export const inputRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: 16,
  borderTop: '1px solid var(--border)',
}

export const input: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  fontSize: 15,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
}

export const sendButton: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
