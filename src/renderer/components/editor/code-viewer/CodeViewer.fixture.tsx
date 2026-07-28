// Screenshot fixture for the code viewer's empty state — what the files item's
// Editor tab shows before any file is chosen. The viewer is a standing tab, so
// this is a state the user can reach at any time, not a transient one. Not used
// by the app at runtime; `npm run screenshot:component CodeViewer`.
import React from 'react'
import { CodeViewer } from './CodeViewer'
import { EditorPaneActions } from '../editor-shell/EditorPaneActions'
import { DockStateContext, type DockAppState } from '../editor-shell/dock-panel-types'

// Enough state for the pane actions (split / move / view mode) to render in the
// viewer's own header row, which is where they live instead of the dock header.
const fixtureState = {
  editorPaneIds: ['editor'],
  getEditorPane: () => ({ openFiles: [], activeFilePath: null, fileContent: null }),
  onActivateEditorPane: () => {},
  onSplitEditorPane: () => {},
  onMoveFileToPane: () => {},
} as unknown as DockAppState

export default (
  <DockStateContext.Provider value={fixtureState}>
    <div style={{ width: 520, height: 320, background: 'var(--bg-primary)' }}>
      <CodeViewer
        headerActions={<EditorPaneActions paneId="editor" />}
        sessionId="fixture-session"
        fileDiffText={null}
        originalContent={null}
        openFiles={[]}
        activeFilePath={null}
        fileContent={null}
        lastFileOpenRequest={{ path: null, source: 'default' }}
        theme="manifold-dark"
        onSelectTab={() => {}}
        onCloseTab={() => {}}
      />
    </div>
  </DockStateContext.Provider>
)
