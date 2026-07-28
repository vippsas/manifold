// Screenshot fixture for the dock chrome (rounded panel cards, group gap,
// sash hover handles, icon-only Files tabs with the group-level close) —
// mirrors the DOCK_THEME and tab/header components AppShell passes to
// DockviewReact. Not used by the app at runtime;
// `npm run screenshot:component DockPreview`.
import React from 'react'
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import '../styles/dockview-theme.css'
import { DockTab } from '../DockTab'
import { WorkspaceHeaderActions } from './editor/editor-shell/WorkspaceHeaderActions'
import { DockStateContext, type DockAppState } from './editor/editor-shell/dock-panel-types'

function Pane(props: IDockviewPanelProps): React.JSX.Element {
  return <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>{props.api.title}</div>
}

function onReady(e: DockviewReadyEvent): void {
  // Mirrors the default arrangement: Repositories on the left, the agent in the
  // middle with a shell below, and on the right the one files item whose
  // centered icon tabs switch between Files, Modified Files and the editor.
  e.api.addPanel({ id: 'projects', component: 'pane', title: 'Repositories' })
  e.api.addPanel({
    id: 'agent', component: 'pane', title: 'Agent',
    position: { referencePanel: 'projects', direction: 'right' },
  })
  e.api.addPanel({
    id: 'fileTree', component: 'pane', title: 'Files',
    position: { referencePanel: 'agent', direction: 'right' },
  })
  for (const [id, title] of [
    ['modifiedFiles', 'Modified Files'],
    ['editor', 'Editor'],
  ] as const) {
    e.api.addPanel({
      id, component: 'pane', title,
      position: { referencePanel: 'fileTree', direction: 'within' },
    })
  }
  e.api.addPanel({
    id: 'shell', component: 'pane', title: 'Shell',
    position: { referencePanel: 'agent', direction: 'below' },
  })
  e.api.getPanel('projects')?.group.api.setSize({ width: 210 })
  e.api.getPanel('fileTree')?.group.api.setSize({ width: 250 })
  e.api.getPanel('shell')?.group.api.setSize({ height: 150 })
  e.api.getPanel('fileTree')?.api.setActive()
}

// Minimal state so DockTab / WorkspaceHeaderActions render their buttons.
const fixtureState = {
  allProjectSessions: {},
  editorPaneIds: [],
  onToggleMaximize: () => {},
  onClosePanel: () => {},
  onOpenModule: () => {},
  isModuleOpen: () => false,
} as unknown as DockAppState

export default (
  <div style={{ width: 980, height: 620, padding: 'var(--space-xs)', background: 'var(--dock-canvas)' }}>
    <DockStateContext.Provider value={fixtureState}>
      <DockviewReact
        components={{ pane: Pane }}
        onReady={onReady}
        defaultTabComponent={DockTab}
        rightHeaderActionsComponent={WorkspaceHeaderActions}
        theme={{ name: 'manifold', className: 'dockview-theme-dark dockview-theme-manifold', gap: 6 }}
      />
    </DockStateContext.Provider>
  </div>
)
