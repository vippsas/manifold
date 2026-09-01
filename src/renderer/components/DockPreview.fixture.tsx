// Screenshot fixture for the dock chrome (rounded panel cards, group gap,
// sash hover handles, and the editor pane whose file tabs are its top strip,
// level with the agent tabs beside it) — mirrors the DOCK_THEME and tab/header
// components AppShell passes to DockviewReact. Not used by the app at runtime;
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
import { TabBar } from './editor/code-viewer/CodeViewerTabs'
import { EditorPaneActions } from './editor/editor-shell/EditorPaneActions'
import { registerEditorPaneModeControls } from './editor/editor-pane-mode-controls'

function Pane(props: IDockviewPanelProps): React.JSX.Element {
  return <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>{props.api.title}</div>
}

/** The editor pane as the app renders it — its own file tabs plus the pane
 *  actions and the × that the (now hidden) group header used to carry. This is
 *  what the capture has to show: one strip here, not two. */
function EditorPane(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TabBar
        openFiles={[{ path: '/repo/log.md', content: '# log', refreshVersion: 0 }]}
        activeFilePath="/repo/log.md"
        actions={<EditorPaneActions paneId="editor" />}
        onActivatePane={() => {}}
        onSelectTab={() => {}}
        onCloseTab={() => {}}
      />
      <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>Editor</div>
    </div>
  )
}

// Mirrors AppShell's right-header composition, so the capture shows the shell's
// pills where they actually land: the far end of the strip.
function RightHeaderActions(props: React.ComponentProps<typeof ShellHeaderActions>): React.JSX.Element {
  return (
    <>
      <ShellHeaderActions {...props} />
      <WorkspaceHeaderActions {...props} />
    </>
  )
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
    id: 'editor', component: 'editorPane', title: 'Editor',
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
  folders: [{ projectId: 'p1', name: 'storefront', path: '/repos/storefront' }],
  onAddShell: () => {},
  onHideTerminals: () => {},
})

// The editor pane's view-mode toggle reads the same module store at runtime;
// registering a stub shows the Preview pill the strip actually carries.
registerEditorPaneModeControls('editor', {
  canShowPreview: true,
  canShowDiff: false,
  mode: 'editor',
  showEditor: () => {},
  showPreview: () => {},
  showDiff: () => {},
})

// Minimal state so DockTab / WorkspaceHeaderActions / EditorPaneActions render
// their buttons.
const fixtureState = {
  allProjectSessions: {},
  editorPaneIds: ['editor'],
  getEditorPane: () => ({
    id: 'editor',
    openFiles: [{ path: '/repo/log.md', content: '# log', refreshVersion: 0 }],
    activeFilePath: '/repo/log.md',
    fileContent: '# log',
  }),
  onToggleMaximize: () => {},
  onClosePanel: () => {},
  onOpenModule: () => {},
  isModuleOpen: () => false,
} as unknown as DockAppState

export default (
  <div style={{ width: 980, height: 620, padding: 'var(--space-xs)', background: 'var(--dock-canvas)' }}>
    <DockStateContext.Provider value={fixtureState}>
      <DockviewReact
        components={{ pane: Pane, editorPane: EditorPane }}
        onReady={onReady}
        defaultTabComponent={DockTab}
        rightHeaderActionsComponent={RightHeaderActions}
        theme={{ name: 'manifold', className: 'dockview-theme-dark dockview-theme-manifold', gap: 6 }}
        disableDnd
      />
    </DockStateContext.Provider>
  </div>
)
