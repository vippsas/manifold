// resources/plugins/manifold.watch/src/webview/styles/FrameLightbox.styles.ts
// Ported verbatim from src/renderer/components/watch/FrameLightbox.styles.ts.
import type { CSSProperties } from 'react'

export const lightboxStyles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 32,
  },
  frame: {
    display: 'flex', flexDirection: 'column', gap: 8,
    maxWidth: '90vw', maxHeight: '90vh',
  },
  image: {
    maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain',
    borderRadius: 6, background: '#000',
  },
  caption: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    color: 'var(--text-default, #fff)', fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  closeButton: {
    padding: '4px 10px', borderRadius: 4,
    background: 'var(--bg-input, rgba(255,255,255,0.12))',
    color: 'var(--text-default, #fff)',
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.2))',
    fontSize: 12, cursor: 'pointer',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  navButton: {
    width: 28, height: 24, borderRadius: 4,
    background: 'var(--bg-input, rgba(255,255,255,0.12))',
    color: 'var(--text-default, #fff)',
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.2))',
    fontSize: 16, lineHeight: 1, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.4, cursor: 'default',
  },
}
