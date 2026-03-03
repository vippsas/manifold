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
  borderRight: 'none',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

export const resizeHandle: CSSProperties = {
  width: '6px',
  cursor: 'col-resize',
  background: 'var(--border)',
  flexShrink: 0,
  transition: 'background 0.15s',
}

export const resizeHandleActive: CSSProperties = {
  ...resizeHandle,
  background: 'var(--accent, #007acc)',
}

export const previewSide: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
}
