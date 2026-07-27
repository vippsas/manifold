import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { EditorHeaderActions } from './EditorHeaderActions'

/** Right-side header actions for every dock group: the editor pane/mode
 *  actions, which self-gate to editor panes. Apps are per-worktree and live
 *  in the agent's options (AgentSettingsModal), not in any group header. */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <EditorHeaderActions {...props} />
    </div>
  )
}
