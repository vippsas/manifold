import type { CSSProperties } from 'react'

export const wrapper = (isUser: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: isUser ? 'flex-end' : 'flex-start',
  marginBottom: 16,
})

export const bubble = (isUser: boolean): CSSProperties => ({
  maxWidth: '85%',
  padding: isUser ? '10px 16px' : '4px 0',
  borderRadius: isUser ? 20 : 0,
  fontSize: 15,
  lineHeight: 1.6,
  background: isUser ? 'var(--surface)' : 'transparent',
  color: 'var(--text)',
  border: 'none',
})

export const optionsSection: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  flexDirection: 'column',
}

export const optionsHeader: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  padding: '4px 12px',
  border: '1px solid var(--border)',
  borderRadius: 0,
  background: 'var(--surface)',
  alignSelf: 'flex-start',
}

/** Vertical stem connecting pill bottom to first option row */
export const optionsStem: CSSProperties = {
  height: 8,
  borderLeft: '1px solid var(--border)',
}

export const optionsContainer: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

export const optionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
}

/** Fixed-width column that holds the connector lines */
export const connectorCol: CSSProperties = {
  width: 20,
  flexShrink: 0,
  position: 'relative',
}

/** Vertical line — top half (from row top to vertical center) */
export const connectorTop: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: '50%',
  borderLeft: '1px solid var(--border)',
}

/** Vertical line — bottom half (from vertical center to row bottom). Hidden on last row. */
export const connectorBottom: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  bottom: 0,
  borderLeft: '1px solid var(--border)',
}

/** Horizontal arm (from vertical line to the chip) */
export const connectorArm: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  width: '100%',
  borderTop: '1px solid var(--border)',
}

export const optionChipWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '3px 0',
}

export const optionChip: CSSProperties = {
  padding: '5px 12px',
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.3,
  textAlign: 'left',
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
}

export const optionChipHover: CSSProperties = {
  ...optionChip,
  borderColor: 'var(--accent)',
  background: 'rgba(255,255,255,0.05)',
}

export const optionsHint: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  marginTop: 8,
  marginLeft: 22,
  fontStyle: 'italic',
}
