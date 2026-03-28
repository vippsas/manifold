import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

export const modal: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: 32,
  width: 400,
  textAlign: 'center',
  border: '1px solid var(--border)',
}

export const logo: CSSProperties = {
  marginBottom: 24,
}

export const title: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text)',
  margin: '0 0 8px 0',
}

export const subtitle: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted)',
  margin: '0 0 24px 0',
  lineHeight: 1.5,
}

export const githubButton: CSSProperties = {
  background: '#fff',
  color: '#000',
  border: 'none',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 16,
}

export const cancelButton: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 13,
  cursor: 'pointer',
  padding: '8px 16px',
}

export const progressBox: CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

export const spinner: CSSProperties = {
  width: 20,
  height: 20,
  border: '2px solid var(--accent)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
}

export const errorText: CSSProperties = {
  color: 'var(--error)',
  fontSize: 14,
  margin: '0 0 16px 0',
}

export const hint: CSSProperties = {
  opacity: 0.4,
  fontSize: 12,
  margin: 0,
}
