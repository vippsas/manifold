import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/dock-panel-types'
import { AddSiblingAgentButton } from './components/editor/AddSiblingAgentButton'

export function DockTab({ api }: IDockviewPanelHeaderProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const title = api.title ?? ''
  const showAddSibling = api.id === 'agent'
    && state != null
    && !state.activeSuperagentId
    && (state.activeSessionStatus === 'running' || state.activeSessionStatus === 'waiting')
  return (
    <div className="dock-tab">
      <span className="dock-tab__label truncate">{title}</span>
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
        title={`Close ${title}`}
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
