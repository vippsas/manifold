import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import { parseSiblingSessionId } from './hooks/agent-session/agent-siblings'

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
  return (
    <div
      className="dock-tab"
      onDoubleClick={() => state?.onToggleMaximize(api.id)}
    >
      {roleLabel && roleClassName && (
        <span className={roleClassName} title={roleTitle ?? undefined}>{roleLabel}</span>
      )}
      <span className="dock-tab__label truncate">{displayTitle}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); state?.onClosePanel(api.id) }}
        onDoubleClick={(e) => e.stopPropagation()}
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
