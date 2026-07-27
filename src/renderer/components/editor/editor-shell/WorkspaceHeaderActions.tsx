import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { EditorHeaderActions } from './EditorHeaderActions'
import { ModuleLauncher } from './ModuleLauncher'

/** Right-side header actions for every dock group: the editor pane/mode
 *  actions (which self-gate to editor panes) plus the module launcher,
 *  shown only in the group that owns the `projects` panel so it renders once
 *  in the Repositories header, alongside the add-agent button. */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const ownsProjects = props.panels.some((panel) => panel.id === 'projects')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <EditorHeaderActions {...props} />
      {ownsProjects && <ModuleLauncher />}
    </div>
  )
}
