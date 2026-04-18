import type { CSSProperties } from 'react'
export const root: CSSProperties = { height: '100%', display: 'flex', flexDirection: 'column', padding: 8, gap: 8, overflowY: 'auto' }
export const header: CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)' }
export const empty: CSSProperties = { padding: 16, color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }
export const card: CSSProperties = { background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 8 }
export const cardHeader: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
export const statusChip: CSSProperties = { fontSize: 11, padding: '2px 6px', borderRadius: 10, background: 'var(--color-surface-2)' }
export const outputTail: CSSProperties = { fontFamily: 'var(--terminal-font-family)', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 80, overflow: 'hidden' }
