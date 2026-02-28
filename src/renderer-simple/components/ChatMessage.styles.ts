import type { CSSProperties } from 'react'

export const wrapper = (isUser: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: isUser ? 'flex-end' : 'flex-start',
  marginBottom: 12,
})

export const bubble = (isUser: boolean): CSSProperties => ({
  maxWidth: '80%',
  padding: '12px 16px',
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.5,
  background: isUser ? 'transparent' : 'var(--surface)',
  color: isUser ? 'var(--text)' : 'var(--text)',
  border: isUser ? '1px solid var(--accent)' : '1px solid var(--border)',
})
