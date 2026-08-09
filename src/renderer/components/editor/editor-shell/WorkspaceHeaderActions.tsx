import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { ICON_TAB_PANELS } from '../../../DockTab'
import { PANEL_TITLES } from '../../../hooks/dock-layout/dock-layout-helpers'
import type { DockPanelId } from '../../../hooks/dock-layout/useDockLayout'

/** Right-side header actions for every dock group: a single × for groups made
 *  of icon-only tabs (the sidebar, the editor) — those tabs carry no per-tab
 *  close button of their own (see DockTab), and the sidebar renders no tab at
 *  all, so the group header is what closes them. In practice this serves the
 *  sidebar: an editor alone in its group hides this header entirely, and its ×
 *  and pane actions both live in the code viewer's own tab bar (see
 *  EditorPaneActions). */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const iconPanels = props.panels.filter((panel) => ICON_TAB_PANELS.has(panel.id))
  const closeLabel = `Close ${PANEL_TITLES[iconPanels[0]?.id as DockPanelId] ?? ''}`.trim()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {state && iconPanels.length > 0 && (
        <button
          type="button"
          className="dock-header-collapse"
          onClick={() => { for (const panel of iconPanels) state.onClosePanel(panel.id) }}
          title={closeLabel}
          aria-label={closeLabel}
        >
          &times;
        </button>
      )}
    </div>
  )
}
