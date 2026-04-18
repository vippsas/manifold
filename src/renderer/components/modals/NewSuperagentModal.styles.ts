import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
export const modal: CSSProperties = {
  background: 'var(--color-surface-1)', borderRadius: 8, padding: 24,
  width: 560, maxHeight: '80vh', overflow: 'auto',
  border: '1px solid var(--color-border)',
}
export const title: CSSProperties = { margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }
export const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }
export const label: CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)' }
export const input: CSSProperties = {
  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
  borderRadius: 4, padding: '6px 8px', color: 'var(--color-text)',
}
export const fleetList: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  maxHeight: 180, overflowY: 'auto',
  border: '1px solid var(--color-border)', borderRadius: 4, padding: 8,
}
export const fleetRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
export const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }
export const primaryButton: CSSProperties = {
  background: 'var(--color-accent)', color: 'var(--color-accent-on)',
  border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
export const secondaryButton: CSSProperties = {
  background: 'transparent', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
