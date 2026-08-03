import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { AgentSession } from '../../../../shared/types'
import { DockStateContext } from './dock-panel-types'
import { isSiblingPanelId } from '../../../hooks/agent-session/agent-siblings'
import { formatBranchLabel } from '../../sidebar/agent-labels'
import { AgentSettingsModal } from '../../modals/AgentSettingsModal'
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

/** The + (and settings gear) in the agent group's tab bar. Agents are the tabs
 *  of this group, so this is where a new one is added: + opens the New Agent
 *  dialog on the active workspace, and the agent it launches joins as a sibling
 *  tab. */
export function AgentHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const [settingsVisible, setSettingsVisible] = React.useState(false)

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  // The workspace the new agent joins: the focused one, or whichever holds the
  // active repo (a repo is always in at least its home workspace). Which folder
  // is selected doesn't matter — the workspace decides where its agents run.
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    ?? state.workspaces.find((w) => w.projectIds.includes(state.activeProjectId ?? ''))

  const activeSession: AgentSession | null = state.sessionId
    ? Object.values(state.allProjectSessions).flat().find((s) => s.id === state.sessionId) ?? null
    : null
  const sessionProjectPath = activeSession
    ? state.projects.find((p) => p.id === activeSession.projectId)?.path ?? ''
    : ''

  return (
    <div style={headerActions}>
      {activeSession && (
        <>
          <button
            type="button"
            style={styles.headerAddButton}
            className="agent-header-settings-button"
            onClick={() => setSettingsVisible(true)}
            title="Agent settings"
            aria-label="Agent settings"
          >
            ⚙
          </button>
          <AgentSettingsModal
            visible={settingsVisible}
            session={activeSession}
            fallbackName={activeSession.displayName?.trim()
              || formatBranchLabel(activeSession.branchName, sessionProjectPath)}
            onSave={(settings) => state.onRenameAgent(activeSession.id, settings)}
            onClose={() => setSettingsVisible(false)}
          />
        </>
      )}
      {workspace && (
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
      )}
    </div>
  )
}
