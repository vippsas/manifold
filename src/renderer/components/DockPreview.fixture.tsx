// Screenshot fixture for the dock chrome (rounded panel cards, group gap,
// sash hover handles, the icon-only editor tab with the group-level close) —
// mirrors the DOCK_THEME and tab/header components AppShell passes to
// DockviewReact. Not used by the app at runtime;
// `npm run screenshot:component DockPreview`.
import React from 'react'
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import '../styles/dockview-theme.css'
import { DockTab } from '../DockTab'
import { WorkspaceHeaderActions } from './editor/editor-shell/WorkspaceHeaderActions'
import { ShellHeaderActions } from './terminal/ShellHeaderActions'
import { registerShellHeaderControls } from './terminal/shell-header-controls'
import { DockStateContext, type DockAppState } from './editor/editor-shell/dock-panel-types'

function Pane(props: IDockviewPanelProps): React.JSX.Element {
  return <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>{props.api.title}</div>
}

function onReady(e: DockviewReadyEvent): void {
  // Mirrors the default arrangement plus an open file: the one sidebar on the
  // left (tabless — the activity rail says which view it shows), the agent in
  // the middle with a shell below, and the editor opened beside the agent.
  e.api.addPanel({ id: 'sidebar', component: 'pane', title: 'Sidebar' })
  e.api.addPanel({
    id: 'agent', component: 'pane', title: 'Agent',
    position: { referencePanel: 'sidebar', direction: 'right' },
  })
  e.api.addPanel({
    id: 'editor', component: 'pane', title: 'Editor',
    position: { referencePanel: 'agent', direction: 'right' },
  })
  e.api.addPanel({
    id: 'shell', component: 'pane', title: 'Shell',
    position: { referencePanel: 'agent', direction: 'below' },
  })
  e.api.getPanel('sidebar')?.group.api.setSize({ width: 210 })
  e.api.getPanel('shell')?.group.api.setSize({ height: 150 })
  // Active so its header actions (the + pill) render.
  e.api.getPanel('shell')?.api.setActive()
}

// The shell's header + is published through a module store at runtime; register
// a stub so the fixture shows that button alongside the other header pills.
registerShellHeaderControls({
  canAddShell: true,
  activeSessionId: 'shell-1',
  onCloseTerminal: () => {},
  onAddShell: () => {},
})

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
        leftHeaderActionsComponent={ShellHeaderActions}
        rightHeaderActionsComponent={WorkspaceHeaderActions}
        theme={{ name: 'manifold', className: 'dockview-theme-dark dockview-theme-manifold', gap: 6 }}
      />
    </DockStateContext.Provider>
  </div>
)
