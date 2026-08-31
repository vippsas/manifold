import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export const messages: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 20px',
  display: 'flex',
  flexDirection: 'column',
}

export const inputRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 8,
  padding: '12px 16px',
}

export const inputColumn: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  position: 'relative',
  borderRadius: 'var(--radius-md)',
  transition: 'box-shadow 120ms ease, background 120ms ease',
}

export const inputColumnDragOver: CSSProperties = {
  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  boxShadow: '0 0 0 2px var(--accent) inset',
}

export const dropHint: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent)',
  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  borderRadius: 'var(--radius-md)',
  zIndex: 1,
}

export const thumbnailStrip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 6px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
}

export const thumbnailItem: CSSProperties = {
  position: 'relative',
  width: 44,
  height: 44,
  borderRadius: 8,
  overflow: 'hidden',
  flexShrink: 0,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
}

export const thumbnailImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

export const thumbnailRemove: CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 16,
  height: 16,
  padding: 0,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0, 0, 0, 0.65)',
  color: '#fff',
  fontSize: 11,
  lineHeight: '16px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const thumbnailCounter: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  color: 'var(--text-muted)',
  paddingRight: 4,
}

// The `.reticle-input` resting corner brackets are this field's edge, so the box
// is transparent and the border stays 1px-transparent to give the reticle a
// border-box to paint into without shifting layout on focus. `--radius-md` keeps
// corners square enough for the brackets to render — a pill radius would clip
// them away.
export const input: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  minHeight: 48,
  maxHeight: 114,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text)',
  outline: 'none',
  resize: 'none',
  overflowY: 'hidden',
}

// Layout only — the metallic plate surface (gradient, border, text color) comes
// from the shared `.btn-metal` class, matching the Start Agent button.
export const sendButton: CSSProperties = {
  alignSelf: 'flex-end',
  flexShrink: 0,
  boxSizing: 'border-box',
  height: 48,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-sm)',
  padding: '0 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

export const interruptButton: CSSProperties = {
  alignSelf: 'flex-end',
  flexShrink: 0,
  boxSizing: 'border-box',
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  width: 48,
  height: 48,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
