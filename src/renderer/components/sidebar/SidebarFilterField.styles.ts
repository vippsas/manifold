import type React from 'react'

export const filterFieldStyles: Record<string, React.CSSProperties> = {
  // A control, not a row: bordered, on the input surface, one step in from the
  // list edge so it lines up with the rows' glyph column.
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '26px',
    margin: '2px 12px 6px',
    padding: '0 8px',
    border: '1px solid var(--control-border)',
    background: 'var(--control-bg)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--text-primary)',
    font: 'inherit',
    fontSize: 'var(--type-ui-small)',
    outline: 'none',
  },
}
