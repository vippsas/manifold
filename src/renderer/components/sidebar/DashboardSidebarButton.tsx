import React, { useContext } from 'react'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'

/**
 * Persistent entry point to the global Dashboard home surface, shown at the top of
 * the Repositories sidebar so it's reachable from any agent / filetree context. Reads
 * the open handler from DockStateContext (no prop drilling, like FavoritesList).
 */
const styles: Record<string, React.CSSProperties> = {
  button: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', width: '100%',
    padding: 'var(--space-xs) var(--space-sm)', margin: '0 0 var(--space-xs)',
    background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
    fontSize: 'var(--type-ui-small)', fontWeight: 600, textAlign: 'left',
    borderRadius: 'var(--radius-sm)', transition: 'background 150ms ease, color 150ms ease',
  },
}

export function DashboardSidebarButton(): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  if (!state?.onOpenDashboard) return null
  return (
    <button
      type="button"
      style={styles.button}
      onClick={() => state.onOpenDashboard()}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--list-hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
    >
      <span aria-hidden style={{ opacity: 0.7 }}>⊞</span> Dashboard
    </button>
  )
}
