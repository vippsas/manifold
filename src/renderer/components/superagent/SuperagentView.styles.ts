import type { CSSProperties } from 'react'
export const root: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr auto', height: '100%', gap: 1, background: 'var(--color-border)' }
export const pane: CSSProperties = { background: 'var(--color-surface-0)', overflow: 'hidden' }
export const bottomStrip: CSSProperties = { gridColumn: '1 / span 2', background: 'var(--color-surface-1)', borderTop: '1px solid var(--color-border)' }
export const terminalHost: CSSProperties = { height: '100%', width: '100%' }
