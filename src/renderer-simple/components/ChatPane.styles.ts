import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export const messages: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 20px',
}

export const inputRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '12px 16px',
}

export const input: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  fontSize: 15,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  color: 'var(--text)',
  outline: 'none',
}

export const sendButton: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-text)',
  border: 'none',
  borderRadius: 20,
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

export const interruptButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--warning)',
  border: '1px solid var(--warning)',
  borderRadius: 20,
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
