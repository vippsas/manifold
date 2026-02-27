import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
}

export const splitPane: CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
}

export const chatSide: CSSProperties = {
  width: '40%',
  borderRight: '1px solid var(--border)',
}

export const previewSide: CSSProperties = {
  flex: 1,
}
