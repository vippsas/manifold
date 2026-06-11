// resources/plugins/manifold.watch/src/webview/styles/WatchVideoCard.styles.ts
// Card styles carried over from the retired playlist preview.
import type { CSSProperties } from 'react'

export const watchVideoCardStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 8,
    flex: 1, minHeight: 0, overflowY: 'auto',
    // Symmetric padding so the card glow (box-shadow extending outside the
    // card) isn't clipped on the left edge by overflow:auto.
    padding: '2px 4px',
  },
  loadingLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'var(--text-default)', opacity: 0.85,
    padding: '4px 4px 6px',
  },
  spinner: {
    width: 12, height: 12,
    border: '2px solid var(--accent)',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 10, borderRadius: 8,
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    animation: 'watch-preview-in 220ms ease-out',
  },
  cardTop: { display: 'flex', gap: 10, alignItems: 'stretch' },
  thumb: {
    flex: '0 0 auto', width: 120, aspectRatio: '16 / 9',
    borderRadius: 6, objectFit: 'cover',
    background: 'var(--bg-default)', border: '1px solid var(--border-subtle)',
  },
  thumbFallback: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, opacity: 0.5,
  },
  meta: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  title: {
    fontSize: 13, fontWeight: 600, lineHeight: 1.35,
    color: 'var(--text-default)',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  subRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, opacity: 0.75, flexWrap: 'wrap' },
  duration: {
    padding: '1px 6px', borderRadius: 3,
    background: 'var(--bg-default)', border: '1px solid var(--border-subtle)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  promptLabel: {
    fontSize: 10, fontWeight: 600, opacity: 0.65,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  questionRow: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  textarea: {
    flex: 1, minHeight: 56, padding: '6px 8px', borderRadius: 4,
    background: 'var(--bg-default)', color: 'var(--text-default)',
    border: '1px solid var(--border-subtle)', fontSize: 12, outline: 'none',
    fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
  },
  aiButton: {
    flex: '0 0 auto',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    background: 'transparent', color: 'var(--text-default)',
    fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
    cursor: 'pointer', lineHeight: 1.4, whiteSpace: 'nowrap',
  },
  aiButtonDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  aiButtonImproving: {
    opacity: 1,
    cursor: 'progress',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    animation: 'ai-pulse 1.4s ease-in-out infinite',
  },
  aiSpinner: {
    width: 10, height: 10,
    border: '1.5px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
}
