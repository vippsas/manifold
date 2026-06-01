import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { EditorHeaderActions } from './EditorHeaderActions'
import { ModuleLauncher } from './ModuleLauncher'

/** Right-side header actions for every dock group: the editor pane/mode
 *  actions (which self-gate to editor panes) plus the module launcher,
 *  shown only in the group that owns the `agent` panel so it renders once
 *  at the end of the main workspace tab strip. */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const ownsAgent = props.panels.some((panel) => panel.id === 'agent')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <EditorHeaderActions {...props} />
      {ownsAgent && <ModuleLauncher />}
    </div>
  )
}
