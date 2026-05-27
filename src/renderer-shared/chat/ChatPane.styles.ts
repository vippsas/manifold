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
  alignItems: 'flex-end',
  gap: 8,
  padding: '12px 16px',
}

export const input: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  minHeight: 48,
  maxHeight: 114,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  color: 'var(--text)',
  outline: 'none',
  resize: 'none',
  overflowY: 'hidden',
}

export const sendButton: CSSProperties = {
  alignSelf: 'flex-end',
  flexShrink: 0,
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
  alignSelf: 'flex-end',
  flexShrink: 0,
  background: 'transparent',
  color: 'var(--warning)',
  border: '1px solid var(--warning)',
  borderRadius: 20,
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
