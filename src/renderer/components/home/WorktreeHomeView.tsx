import React from 'react'
import { PluginViewPanel } from '../editor/plugins/PluginViewPanel'

/**
 * The global "home layer" surface for the Worktrees overview (#744). It covers the
 * per-agent dock area and hosts the `manifold.worktrees` plugin webview by view id.
 * Rendered inside AppShell's DockStateContext provider so the plugin webview inherits
 * the active theme. Read-only in v1; cleanup actions land in a follow-up.
 */
export function WorktreeHomeView({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div
      data-testid="worktree-home-view"
      style={{ position: 'absolute', inset: 0, zIndex: 6, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border, rgba(128,128,128,.3))' }}>
        <span style={{ fontWeight: 700 }}>Worktrees</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close worktrees"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PluginViewPanel api={{ id: 'manifold.worktrees.panel' }} />
      </div>
    </div>
  )
}
