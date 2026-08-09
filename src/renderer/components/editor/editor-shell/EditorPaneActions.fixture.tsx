// Screenshot fixture for an editor pane's header actions.
// `npm run screenshot:component EditorPaneActions`.
//
// The view-mode toggle only reads in context: it sits at the right edge of the
// file-tab strip, and the point of its treatment is that it stays quieter than
// the active tab. So each state is shown inside a mock strip carrying the real
// `.code-tab` chrome, one pane per row — editor (at rest), preview and diff (the
// accent state), and a markdown file that can do all three.
import React from 'react'
import { EditorPaneActions } from './EditorPaneActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import { registerEditorPaneModeControls } from '../editor-pane-mode-controls'
import { viewerStyles } from '../code-viewer/CodeViewer.styles'

const ROWS = [
  { paneId: 'editor', mode: 'editor', canShowDiff: false, caption: 'Editor — at rest' },
  { paneId: 'editor:1', mode: 'preview', canShowDiff: false, caption: 'Preview — markdown' },
  { paneId: 'editor:2', mode: 'diff', canShowDiff: true, caption: 'Diff — changed file' },
] as const

const noop = (): void => {}

for (const row of ROWS) {
  registerEditorPaneModeControls(row.paneId, {
    canShowPreview: true,
    canShowDiff: row.canShowDiff,
    mode: row.mode,
    showEditor: noop,
    showPreview: noop,
    showDiff: noop,
  })
}

const state = {
  editorPaneIds: ROWS.map((row) => row.paneId),
  getEditorPane: (paneId: string) => ({
    id: paneId,
    openFiles: [{ path: '/repo/CONTRIBUTING.md', content: '', refreshVersion: 0 }],
    activeFilePath: '/repo/CONTRIBUTING.md',
    fileContent: '',
  }),
  onActivateEditorPane: noop,
  onSplitEditorPane: noop,
  onMoveFileToPane: noop,
} as unknown as DockAppState

function MockTab({ name, active }: { name: string; active: boolean }): React.JSX.Element {
  return (
    <div className={`code-tab${active ? ' code-tab--active' : ''}`} style={viewerStyles.tab}>
      <span style={viewerStyles.tabLabel}>{name}</span>
      <span className="code-tab__close" style={viewerStyles.tabClose}>{'×'}</span>
    </div>
  )
}

export default (
  <div style={{ padding: 16, background: 'var(--dock-canvas)', display: 'flex', flexDirection: 'column', gap: 18 }}>
    {ROWS.map((row) => (
      <div key={row.paneId}>
        <p style={{ margin: '0 0 6px', fontSize: 'var(--type-ui-caption)', color: 'var(--text-secondary)' }}>
          {row.caption}
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={viewerStyles.tabBar}>
            <div style={viewerStyles.tabStrip}>
              <MockTab name=".gitattributes" active={false} />
              <MockTab name="CONTRIBUTING.md" active />
            </div>
            <div style={viewerStyles.tabActions}>
              <DockStateContext.Provider value={state}>
                <EditorPaneActions paneId={row.paneId} />
              </DockStateContext.Provider>
            </div>
          </div>
          <div style={{ height: 40, background: 'var(--bg-primary)' }} />
        </div>
      </div>
    ))}
  </div>
)
