import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { ICON_TAB_PANELS } from '../../../DockTab'
import { PANEL_TITLES } from '../../../hooks/dock-layout/dock-layout-helpers'
import type { DockPanelId } from '../../../hooks/dock-layout/useDockLayout'

/** Right-side header actions for every dock group: a single × for groups made
 *  of icon-only tabs (Repositories, Files / Modified Files) — those tabs carry
 *  no per-tab close buttons (see DockTab), so the group header closes the whole
 *  item. The editor's pane actions are deliberately not here; they live in the
 *  code viewer's own tab bar (see EditorPaneActions). */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const iconPanels = props.panels.filter((panel) => ICON_TAB_PANELS.has(panel.id))
  const closeLabel = iconPanels.length === 1
    ? `Close ${PANEL_TITLES[iconPanels[0].id as DockPanelId]}`
    : 'Close Files'
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
