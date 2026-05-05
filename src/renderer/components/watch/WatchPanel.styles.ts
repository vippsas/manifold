import type { CSSProperties } from 'react'

export const watchStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    padding: 16, gap: 12, color: 'var(--text-default)', fontSize: 13,
    boxSizing: 'border-box',
  },
  label: { fontSize: 11, fontWeight: 600, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    background: 'var(--bg-input)', color: 'var(--text-default)',
    border: '1px solid var(--border-subtle)', fontSize: 13, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', minHeight: 64, padding: '8px 10px', borderRadius: 6,
    background: 'var(--bg-input)', color: 'var(--text-default)',
    border: '1px solid var(--border-subtle)', fontSize: 13, outline: 'none',
    fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
  },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  runButton: {
    padding: '8px 16px', borderRadius: 6, border: 'none',
    background: 'var(--accent)', color: 'var(--accent-fg)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  runButtonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  hint: { fontSize: 11, opacity: 0.6 },
  error: { color: 'var(--text-error, #d33)', fontSize: 12, marginTop: 4 },
  status: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, opacity: 0.75, marginTop: 'auto' },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 4 },
  dotOk: { background: '#3a7' },
  dotMissing: { background: '#c44' },
}
