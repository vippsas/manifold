import type { CSSProperties } from 'react'
export const root: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr auto', height: '100%', gap: 1, background: 'var(--border)' }
export const pane: CSSProperties = { background: 'var(--bg-primary)', overflow: 'hidden' }
export const bottomStrip: CSSProperties = { gridColumn: '1 / span 2', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }
export const terminalHost: CSSProperties = { height: '100%', width: '100%' }
