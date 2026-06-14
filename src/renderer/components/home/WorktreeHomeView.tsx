import React, { useEffect } from 'react'
import { PluginViewPanel } from '../editor/plugins/PluginViewPanel'

/**
 * The global "home layer" surface for the Worktrees overview (#744). Covers the
 * per-agent dock and hosts the `manifold.worktrees` plugin webview by view id.
 * Rendered inside AppShell's DockStateContext provider so the webview inherits the
 * active theme. Read-only in v1; cleanup actions land in a follow-up.
 */
const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'absolute', inset: 0, zIndex: 6, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)',
    padding: '0 var(--space-md)', minHeight: 'var(--dialog-header-height)',
    background: 'var(--bg-chrome)', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titleWrap: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  title: { fontSize: 'var(--type-ui)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 },
  subtitle: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', lineHeight: 1.3 },
  doneBtn: {
    height: 'var(--control-height)', padding: '0 var(--space-md)', background: 'var(--control-bg)',
    border: '1px solid var(--control-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 'var(--type-ui-small)', transition: 'background 150ms ease, color 150ms ease', flexShrink: 0,
  },
  body: { flex: 1, minHeight: 0 },
}

export function WorktreeHomeView({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div data-testid="worktree-home-view" style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <span style={styles.title}>Worktrees</span>
          <span style={styles.subtitle}>Review and clean up worktrees and merged branches across all your repositories</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close worktrees"
          style={styles.doneBtn}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--control-bg-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--control-bg)' }}
        >
          Done <span style={{ opacity: 0.6 }}>Esc</span>
        </button>
      </div>
      <div style={styles.body}>
        <PluginViewPanel api={{ id: 'manifold.worktrees.panel' }} />
      </div>
    </div>
  )
}
