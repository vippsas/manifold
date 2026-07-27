// Screenshot fixture for the dock chrome (rounded panel cards, group gap,
// sash hover handles) — mirrors the DOCK_THEME AppShell passes to DockviewReact.
// Not used by the app at runtime; `npm run screenshot:component DockPreview`.
import React from 'react'
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import '../styles/dockview-theme.css'

function Pane(props: IDockviewPanelProps): React.JSX.Element {
  return <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>{props.api.title}</div>
}

function onReady(e: DockviewReadyEvent): void {
  e.api.addPanel({ id: 'projects', component: 'pane', title: 'Repositories' })
  e.api.addPanel({
    id: 'agent', component: 'pane', title: 'Agent',
    position: { referencePanel: 'projects', direction: 'right' },
  })
  e.api.addPanel({
    id: 'fileTree', component: 'pane', title: 'Files',
    position: { referencePanel: 'agent', direction: 'right' },
  })
  e.api.addPanel({
    id: 'shell', component: 'pane', title: 'Shell',
    position: { referencePanel: 'agent', direction: 'below' },
  })
  e.api.getPanel('projects')?.group.api.setSize({ width: 170 })
  e.api.getPanel('fileTree')?.group.api.setSize({ width: 170 })
  e.api.getPanel('shell')?.group.api.setSize({ height: 150 })
}

export default (
  <div style={{ width: 980, height: 620, padding: 'var(--space-xs)', background: 'var(--dock-canvas)' }}>
    <DockviewReact
      components={{ pane: Pane }}
      onReady={onReady}
      theme={{ name: 'manifold', className: 'dockview-theme-dark dockview-theme-manifold', gap: 6 }}
    />
  </div>
)
