import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
export const modal: CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: 8, padding: 24,
  width: 560, maxHeight: '80vh', overflow: 'auto',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}
export const title: CSSProperties = { margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }
export const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }
export const label: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' }
export const fieldHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}
export const helperText: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}
export const input: CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '6px 8px', color: 'var(--text-primary)',
}
export const fleetList: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  maxHeight: 180, overflowY: 'auto',
  border: '1px solid var(--border)', borderRadius: 4, padding: 8,
  background: 'var(--bg-secondary)',
}
export const fleetRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '6px 4px',
  borderRadius: 4,
}
export const fleetRowText: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  gap: 2,
}
export const fleetName: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 13,
}
export const fleetPath: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
export const emptyState: CSSProperties = {
  padding: '8px 4px',
  color: 'var(--text-muted)',
  fontSize: 12,
}
export const errorText: CSSProperties = {
  color: 'var(--status-error)',
  fontSize: 12,
  lineHeight: 1.4,
}
export const selectionNote: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: 4,
}
export const optionList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 6,
}
export const optionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  color: 'var(--text-secondary)',
  fontSize: 12,
}
export const optionText: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}
export const optionLabel: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 12,
}
export const optionDetail: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  lineHeight: 1.4,
}
export const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }
export const primaryButton: CSSProperties = {
  background: 'var(--accent)', color: 'var(--accent-text)',
  border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
export const secondaryButton: CSSProperties = {
  background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
export const inlineButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  flexShrink: 0,
}
