import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  height: 38,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  background: 'linear-gradient(180deg, var(--bg-chrome-hi, var(--surface)) 0%, var(--bg-chrome-lo, var(--surface)) 100%)',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
  // @ts-expect-error -- Electron-specific CSS property for window dragging
  WebkitAppRegion: 'drag',
}

export const trafficLightSpacer: CSSProperties = {
  width: 78,
  flexShrink: 0,
}

export const title: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-muted)',
}

export const button: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-secondary, var(--text-muted))',
  background: 'rgba(255, 255, 255, 0.04)',
  cursor: 'pointer',
  // @ts-expect-error -- Electron-specific CSS property to make button clickable in drag region
  WebkitAppRegion: 'no-drag',
}

export const buttonIcon: CSSProperties = {
  fontSize: 13,
}
