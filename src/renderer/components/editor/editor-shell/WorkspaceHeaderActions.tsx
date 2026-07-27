import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { EditorHeaderActions } from './EditorHeaderActions'
import { DockStateContext } from './dock-panel-types'

const FILES_PANEL_IDS = new Set(['fileTree', 'modifiedFiles'])

/** Right-side header actions for every dock group: the editor pane/mode
 *  actions (self-gated to editor panes) plus a single × for the Files /
 *  Modified Files pair — those tabs are icon-only without per-tab close
 *  buttons (see DockTab), so the group header closes the whole item. */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const filePanels = props.panels.filter((panel) => FILES_PANEL_IDS.has(panel.id))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <EditorHeaderActions {...props} />
      {state && filePanels.length > 0 && (
        <button
          type="button"
          className="dock-header-collapse"
          onClick={() => { for (const panel of filePanels) state.onClosePanel(panel.id) }}
          title="Close Files"
          aria-label="Close Files"
        >
          &times;
        </button>
      )}
    </div>
  )
}
