// Screenshot fixture for the dock tab's agent controls and chip styling.
// `npm run screenshot:component DockTab`.
//
// Tabs are wrapped in mock `.dv-tab` / `.dv-active-tab` elements under the
// dockview theme class so the chip fills (active accent, inactive elevated,
// hover) render exactly as in the real dock. Shown twice: at rest, and with the
// hover reveal forced on (the per-tab ⚙/🔒/🗑 are hidden until the tab is
// hovered). The third tab is a locked agent — its padlock must read at rest,
// where the other actions are still hidden, and its 🗑 must read as disabled.
import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockTab } from './DockTab'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import { siblingPanelId } from './hooks/agent-session/agent-siblings'

function headerProps(id: string, title: string): IDockviewPanelHeaderProps {
  return {
    api: { id, title, onDidTitleChange: () => ({ dispose: () => {} }) },
  } as unknown as IDockviewPanelHeaderProps
}

const state = {
  primarySessionId: 'primary',
  projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
  allProjectSessions: {
    p1: [
      { id: 'primary', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/main', worktreePath: '/wt', status: 'running', pid: 1, additionalDirs: [], displayName: 'Claude' },
      { id: 'child-1', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/review', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [], displayName: 'Review' },
      { id: 'child-2', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/release', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [], displayName: 'Release', locked: true },
    ],
  },
  onRenameAgent: () => {},
  onToggleLocked: () => {},
  onRequestDeleteAgent: () => {},
  onToggleMaximize: () => {},
  onClosePanel: () => {},
} as unknown as DockAppState

const tabWrap: React.CSSProperties = { display: 'flex', alignItems: 'stretch' }
const strip: React.CSSProperties = {
  display: 'flex', alignItems: 'stretch', height: 'var(--chrome-tab-height)',
  padding: '0 4px', background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 'var(--radius-lg)', width: 520,
}

function Strip({ hover }: { hover?: boolean }): React.JSX.Element {
  return (
    <div className={hover ? 'force-hover' : undefined} style={strip}>
      <div className="dv-tab dv-active-tab" style={tabWrap}>
        <DockTab {...headerProps('agent', 'Claude')} />
      </div>
      <div className="dv-tab" style={tabWrap}>
        <DockTab {...headerProps(siblingPanelId('child-1'), 'Review')} />
      </div>
      <div className="dv-tab" style={tabWrap}>
        <DockTab {...headerProps(siblingPanelId('child-2'), 'Release')} />
      </div>
    </div>
  )
}

export default (
  <div className="dockview-theme-dark dockview-theme-manifold">
    <DockStateContext.Provider value={state}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, background: 'var(--dock-canvas)' }}>
        {/* Stands in for a real pointer, which a headless render never has: both
            halves of theme.css's `.dock-tab:hover .dock-tab__action` pair, so a
            locked agent's 🗑 shows the dimming it gets on hover instead of
            staying at the hidden-at-rest opacity. Keep the disabled value in
            step with theme.css. */}
        <style>{'.force-hover .dock-tab__action { opacity: 1 } .force-hover .dock-tab__action:disabled { opacity: 0.45 }'}</style>
        <Strip />
        <Strip hover />
      </div>
    </DockStateContext.Provider>
  </div>
)
