import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { AddSiblingAgentButton } from './AddSiblingAgentButton'
import { ShellHeaderActions } from '../../terminal/ShellHeaderActions'

/** Left header-action slot (rendered right after the tabs): the shell controls
 *  (self-gated to the shell panel) plus the "add agent on this worktree" button,
 *  shown in the Repositories group while the session is live — agents are
 *  created from the repositories panel, next to the list they appear in. */
export function LeftHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const showAddSibling = props.panels.some((panel) => panel.id === 'projects')
    && state != null
    && (state.activeSessionStatus === 'running' || state.activeSessionStatus === 'waiting')
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <ShellHeaderActions {...props} />
      {showAddSibling && state && (
        <AddSiblingAgentButton
          projectId={state.activeProjectId}
          worktreePath={state.activeSessionWorktreePath}
          noWorktree={state.activeSessionNoWorktree}
          onLaunch={state.onLaunchAgent}
        />
      )}
    </div>
  )
}
