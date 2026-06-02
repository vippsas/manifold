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
  const isSuperagentTab = api.id === 'agent' && state?.activeSuperagentId
  const isSuperagentChildTab = Boolean(siblingSession?.parentSuperagentId)
  const isWorkspaceTab = Boolean(siblingSession?.workspaceId)
  const displayTitle = isSuperagentTab
    ? state?.activeSuperagent?.name ?? 'Superagent'
    : title
  const roleLabel = isSuperagentTab
    ? 'S'
    : isWorkspaceTab
      ? 'W'
      : isSuperagentChildTab
        ? 'A'
        : null
  const roleTitle = isSuperagentTab
    ? 'Superagent'
    : isWorkspaceTab
      ? 'Workspace'
      : isSuperagentChildTab
        ? 'Agent'
        : null
  const roleClassName = isSuperagentTab
    ? 'dock-tab__role dock-tab__role--superagent'
    : isWorkspaceTab
      ? 'dock-tab__role dock-tab__role--workspace'
      : isSuperagentChildTab
        ? 'dock-tab__role dock-tab__role--agent'
        : null
  const showAddSibling = api.id === 'agent'
    && state != null
    && !state.activeSuperagentId
    && (state.activeSessionStatus === 'running' || state.activeSessionStatus === 'waiting')
  return (
    <div className={`dock-tab${isSuperagentTab ? ' dock-tab--superagent' : ''}${isSuperagentChildTab ? ' dock-tab--child-agent' : ''}`}>
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
