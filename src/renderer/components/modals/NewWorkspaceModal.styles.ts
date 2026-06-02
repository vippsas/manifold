import type { CSSProperties } from 'react'

export const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: 'var(--bg-primary)', borderRadius: 8, padding: 24,
    width: 560, maxHeight: '80vh', overflow: 'auto',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  },
  title: { margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  label: { fontSize: 12, color: 'var(--text-muted)' },
  fieldHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  input: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '6px 8px', color: 'var(--text-primary)',
  },
  inlineButton: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    flexShrink: 0,
  },
  fleetList: {
    display: 'flex', flexDirection: 'column', gap: 4,
    maxHeight: 180, overflowY: 'auto',
    border: '1px solid var(--border)', borderRadius: 4, padding: 8,
    background: 'var(--bg-secondary)',
  },
  emptyState: {
    padding: '8px 4px',
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  fleetRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 4px',
    borderRadius: 4,
  },
  fleetRowText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  fleetName: {
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  fleetPath: {
    color: 'var(--text-muted)',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  errorText: {
    color: 'var(--status-error)',
    fontSize: 12,
    lineHeight: 1.4,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  primaryButton: {
    background: 'var(--accent)', color: 'var(--accent-text)',
    border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
  },
  secondaryButton: {
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
  },
}
