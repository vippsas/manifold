import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 960,
  margin: '0 auto',
}

export const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 40,
}

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
}

export const newButton: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
}

export const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 20,
}

export const emptyState: CSSProperties = {
  textAlign: 'center' as const,
  padding: 80,
  color: 'var(--text-muted)',
  fontSize: 18,
}
