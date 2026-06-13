import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import { AddSiblingAgentButton } from './components/editor/editor-shell/AddSiblingAgentButton'
import { parseSiblingSessionId } from './hooks/agent-siblings'

export function DockTab({ api }: IDockviewPanelHeaderProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  // Subscribe to title changes so the tab re-renders on update even when the
  // DockStateContext is memoized (which otherwise stops the constant re-renders
  // that currently mask this).
  const [title, setTitle] = React.useState(api.title ?? '')
  React.useEffect(() => {
    setTitle(api.title ?? '')
    const disposable = api.onDidTitleChange(() => setTitle(api.title ?? ''))
    return () => disposable.dispose()
  }, [api])
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
  // The two dock sidebars get a one-click collapse button in their tab header
  // (left = projects, right = file tree). Re-expanding is via the sash edge
  // handle, which restores the remembered pre-collapse width.
  const sidebarSide = api.id === 'projects' ? 'left' : api.id === 'fileTree' ? 'right' : null
  return (
    <div className="dock-tab">
      {roleLabel && roleClassName && (
        <span className={roleClassName} title={roleTitle ?? undefined}>{roleLabel}</span>
      )}
      <span className="dock-tab__label truncate">{displayTitle}</span>
      {sidebarSide && state && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); state.onCollapseSidebar(sidebarSide) }}
          className="dock-tab__collapse"
          title={`Collapse ${displayTitle}`}
          aria-label={`Collapse ${displayTitle}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d={sidebarSide === 'left' ? 'M7 1L3 5L7 9' : 'M3 1L7 5L3 9'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
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
