import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/dock-panel-types'
import { AddSiblingAgentButton } from './components/editor/AddSiblingAgentButton'
import { parseSiblingSessionId } from './hooks/agent-siblings'

export function DockTab({ api }: IDockviewPanelHeaderProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const title = api.title ?? ''
  const siblingSessionId = parseSiblingSessionId(api.id)
  const siblingSession = siblingSessionId && state
    ? Object.values(state.allProjectSessions)
        .flat()
        .find((session) => session.id === siblingSessionId)
    : null
  const isWorkspaceTab = Boolean(siblingSession?.workspaceId)
  const displayTitle = title
  const roleLabel = isWorkspaceTab ? 'W' : null
  const roleTitle = isWorkspaceTab ? 'Workspace' : null
  const roleClassName = isWorkspaceTab ? 'dock-tab__role dock-tab__role--workspace' : null
  const showAddSibling = api.id === 'agent'
    && state != null
    && (state.activeSessionStatus === 'running' || state.activeSessionStatus === 'waiting')
  return (
    <div className="dock-tab">
      {roleLabel && roleClassName && (
        <span className={roleClassName} title={roleTitle ?? undefined}>{roleLabel}</span>
      )}
      <span className="dock-tab__label truncate">{displayTitle}</span>
      {showAddSibling && state && (
        <AddSiblingAgentButton
          projectId={state.activeProjectId}
          worktreePath={state.activeSessionWorktreePath}
          noWorktree={state.activeSessionNoWorktree}
          onLaunch={state.onLaunchAgent}
        />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); state?.onClosePanel(api.id) }}
        className="dock-tab__close"
        title={`Close ${displayTitle}`}
      >
        &times;
      </button>
    </div>
  )
}

export function EmptyWatermark(): React.JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-muted)', fontSize: 'inherit',
    }}>
      Drag a panel here
    </div>
  )
}
