import type { CSSProperties } from 'react'

export const thumbStripStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 6,
    paddingTop: 6, borderTop: '1px solid var(--border-subtle)',
  },
  label: {
    fontSize: 11, fontWeight: 600, opacity: 0.7,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  strip: {
    display: 'flex', flexDirection: 'row', gap: 6,
    overflowX: 'auto', overflowY: 'hidden',
    paddingBottom: 4,
  },
  thumbButton: {
    flex: '0 0 auto',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: 2, borderRadius: 4,
    background: 'transparent', cursor: 'pointer',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-default)',
  },
  thumbImg: {
    width: 96, height: 54, objectFit: 'cover',
    borderRadius: 2, display: 'block', background: 'var(--bg-input)',
  },
  thumbPlaceholder: {
    width: 96, height: 54, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input)', color: 'var(--text-default)',
    fontSize: 11, opacity: 0.6, borderRadius: 2,
  },
  thumbLabel: {
    fontSize: 10, opacity: 0.7, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
}
