// Screenshot fixture for the dock tab's agent overflow menu and chip styling.
// `npm run screenshot:component DockTab`.
//
// Tabs are wrapped in mock `.dv-groupview.dv-active-group` /
// `.dv-tabs-and-actions-container` / `.dv-tab` elements under the dockview theme
// class so the pill fills (active accent, hover, at-rest) render exactly as in
// the real dock. The middle tab's one overflow button is opened after mount; its
// worded menu includes every former glyph.
import React, { useEffect, useRef } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import './styles/dockview-theme.css'
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

const tabWrap: React.CSSProperties = { display: 'flex', alignItems: 'center' }
const card: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)', overflow: 'hidden', width: 520,
  background: 'var(--bg-primary)',
}

function Fixture(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-label="Actions for Review"]')?.click()
  }, [])

  return (
    <div ref={rootRef} className="dockview-theme-dark dockview-theme-manifold">
      <DockStateContext.Provider value={state}>
        <div style={{ padding: 24, background: 'var(--dock-canvas)', minHeight: 220 }}>
          <div className="dv-groupview dv-active-group" style={card}>
            <div className="dv-tabs-and-actions-container">
              <div className="dv-tabs-container">
                <div className="dv-tab dv-active-tab" style={tabWrap}>
                  <DockTab {...headerProps('agent', 'Claude')} />
                </div>
                <div className="dv-tab force-hover" style={tabWrap}>
                  <DockTab {...headerProps(siblingPanelId('child-1'), 'Review')} />
                </div>
                <div className="dv-tab" style={tabWrap}>
                  <DockTab {...headerProps(siblingPanelId('child-2'), 'Release')} />
                </div>
              </div>
            </div>
            <div style={{ height: 60 }} />
          </div>
          <style>{`
            .dockview-theme-manifold .dv-tab.force-hover .dock-tab:not(.dock-tab--icon):not(.dock-tab--headless) { background: var(--list-hover-bg); color: var(--text-primary) }
          `}</style>
        </div>
      </DockStateContext.Provider>
    </div>
  )
}

export default <Fixture />
