import type { CSSProperties } from 'react'
export const root: CSSProperties = { display: 'flex', flexDirection: 'column', padding: 8, gap: 6 }
export const empty: CSSProperties = { color: 'var(--color-text-muted)', fontSize: 11, padding: 4 }
export const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--color-surface-2)', borderRadius: 4 }
export const toolName: CSSProperties = { fontWeight: 600, fontSize: 12 }
export const args: CSSProperties = { flex: 1, fontFamily: 'var(--terminal-font-family)', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
export const approve: CSSProperties = { background: 'var(--color-accent)', color: 'var(--color-accent-on)', border: 'none', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }
export const deny: CSSProperties = { background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }
export const approveAll: CSSProperties = { ...deny, marginLeft: 4 }
