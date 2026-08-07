import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { isSiblingPanelId, parseSiblingSessionId } from '../../../hooks/agent-session/agent-siblings'
import { shellTabStyles as styles } from '../../terminal/ShellTabs.styles'

function isAgentPanelId(id: string): boolean {
  return id === 'agent' || isSiblingPanelId(id)
}

// Dockview wraps a header-actions component in a block-level `.dv-react-part`,
// so a 24px pill would sit at the top of the 30px tab strip. Filling the
// wrapper's height and centring puts these controls on the tab labels' line.
const headerActions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  minWidth: 0,
}

/** The + at the start of the agent group's tab bar (the left header slot).
 *  Agents are the tabs of this group, so this is where a new one is added: +
 *  opens the New Agent dialog on the active workspace. Hiding a tab lives at the
 *  far right (`AgentCloseHeaderActions`); per-agent settings and delete live on
 *  each tab itself (see DockTab). */
export function AgentHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  // The workspace the new agent joins: the focused one, or whichever holds the
  // active repo (a repo is always in at least its home workspace). Which folder
  // is selected doesn't matter — the workspace decides where its agents run.
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    ?? state.workspaces.find((w) => w.projectIds.includes(state.activeProjectId ?? ''))

  if (!workspace) return null

  return (
    <div style={headerActions}>
      <button
        type="button"
        style={styles.headerAddButton}
        className="agent-header-add-button"
        onClick={(event) => {
          event.stopPropagation()
          state.onNewAgentFromHeader(workspace.id)
        }}
        title={`New agent in ${workspace.name}`}
        aria-label={`New agent in ${workspace.name}`}
      >
        +
      </button>
    </div>
  )
}

/** The hide-× at the far right of the agent group's tab bar (the right header
 *  slot, so it lands at the top-right of the view like the shell's ×). It hides
 *  the active *sibling* tab — the agent stays alive, so selecting it again from
 *  the sidebar reopens the tab. Disabled while the structural primary `agent`
 *  tab is active, which is the workspace's persistent surface and cannot be
 *  hidden. */
export function AgentCloseHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  const activePanelId = props.activePanel?.id ?? null
  const activeSiblingSessionId = activePanelId && isSiblingPanelId(activePanelId)
    ? parseSiblingSessionId(activePanelId)
    : null

  return (
    <div style={headerActions}>
      <button
        type="button"
        style={styles.headerCloseButton}
        className="shell-header-close-button"
        onClick={(event) => {
          event.stopPropagation()
          if (activeSiblingSessionId) state.onCloseSiblingPanel(activeSiblingSessionId)
        }}
        disabled={!activeSiblingSessionId}
        title="Hide agent tab"
        aria-label="Hide agent tab"
      >
        ×
      </button>
    </div>
  )
}
