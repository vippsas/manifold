import type { CSSProperties } from 'react'

export const wrapper = (isUser: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: isUser ? 'flex-end' : 'flex-start',
  marginBottom: 16,
})

/** Assistant message laid out as [thread gutter | content] so replies share a vertical timeline. */
export const threadRow: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  position: 'relative',
  marginBottom: 16,
}

const GUTTER_WIDTH = 24
const LINE_LEFT = 11
const DOT_SIZE = 7
const DOT_CENTER = 18

/** Fixed-width column on the left of an assistant message that carries the timeline. */
export const threadGutter: CSSProperties = {
  width: GUTTER_WIDTH,
  flexShrink: 0,
  position: 'relative',
}

/** Line segment from the top of the message down to the node (drawn when a reply precedes it). */
export const threadLineTop: CSSProperties = {
  position: 'absolute',
  left: LINE_LEFT,
  top: 0,
  height: DOT_CENTER,
  borderLeft: '1px solid var(--border)',
}

/** Line segment from the node down through the gap to the next reply (drawn when a reply follows). */
export const threadLineBottom: CSSProperties = {
  position: 'absolute',
  left: LINE_LEFT,
  top: DOT_CENTER,
  bottom: -16,
  borderLeft: '1px solid var(--border)',
}

/** Accent node marking where each reply joins the thread. */
export const threadDot: CSSProperties = {
  position: 'absolute',
  left: LINE_LEFT - DOT_SIZE / 2 + 0.5,
  top: DOT_CENTER - DOT_SIZE / 2,
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: '50%',
  background: 'var(--accent)',
}

/** Content column (bubble + options) sitting to the right of the gutter. */
export const threadContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  minWidth: 0,
  flex: 1,
}

export const bubble = (isUser: boolean): CSSProperties => ({
  maxWidth: '85%',
  padding: '12px 16px',
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.6,
  background: isUser ? 'transparent' : 'var(--surface)',
  color: 'var(--text)',
  border: isUser ? '1px solid var(--accent)' : '1px solid var(--border)',
  boxShadow: isUser ? undefined : 'var(--shadow-subtle)',
})

/** ~6 lines at fontSize 15 × lineHeight 1.6 (24px/line) — the cap for a collapsed user bubble. */
export const COLLAPSED_MAX_HEIGHT = 144

/** Clamps a long user message and fades its lower edge to transparent (works over any background). */
export const userTextClamped: CSSProperties = {
  maxHeight: COLLAPSED_MAX_HEIGHT,
  overflow: 'hidden',
  WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
  maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
}

export const collapseToggle: CSSProperties = {
  marginTop: 6,
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--accent)',
  fontSize: 13,
  fontWeight: 500,
}

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
