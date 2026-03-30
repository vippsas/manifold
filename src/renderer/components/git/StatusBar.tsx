import React from 'react'
import type { AgentSession, FileChange, AheadBehind } from '../../../shared/types'
import type { UseDockLayoutResult, DockPanelId } from '../../hooks/useDockLayout'

const PANEL_LABELS: Record<DockPanelId, string> = {
  projects: 'Repositories',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified',
  shell: 'Shell',
  search: 'Search',
  backgroundAgent: 'Ideas',
}

interface StatusBarProps {
  activeSession: AgentSession | null
  changedFiles: FileChange[]
  baseBranch: string
  dockLayout: UseDockLayoutResult
  conflicts?: string[]
  aheadBehind?: AheadBehind
  onCommit?: () => void
  onCreatePR?: () => void
  onShowConflicts?: () => void
  onOpenSettings?: () => void
}

export function StatusBar({
  activeSession,
  changedFiles,
  baseBranch,
  dockLayout,
  conflicts = [],
  aheadBehind,
  onCommit,
  onCreatePR,
  onShowConflicts,
  onOpenSettings,
}: StatusBarProps): React.JSX.Element {
  const hasConflicts = conflicts.length > 0
  const hasChanges = changedFiles.length > 0
  const hasAhead = (aheadBehind?.ahead ?? 0) > 0

  const hiddenDockPanels = dockLayout.hiddenPanels

  return (
    <div className="layout-status-bar">
      {activeSession ? (
        <>
          <span className="statusbar-item">
            <span className={`status-dot status-dot--${activeSession.status}`} />
            <span className="mono truncate statusbar-branch">
              {activeSession.branchName}
            </span>
          </span>
          <span className="statusbar-item">
            {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
          </span>
        </>
      ) : (
        <span className="statusbar-item">No active agent</span>
      )}
      {activeSession && (
        <span className="statusbar-group">
          {hasConflicts && onShowConflicts ? (
            <button
              type="button"
              onClick={onShowConflicts}
              className="statusbar-button statusbar-button--warning"
              title="Resolve merge conflicts"
            >
              Conflicts ({conflicts.length})
            </button>
          ) : hasChanges && onCommit ? (
            <button
              type="button"
              onClick={onCommit}
              className="statusbar-button statusbar-button--success"
              title="Commit changes"
            >
              Commit
            </button>
          ) : null}
          {hasAhead && onCreatePR && (
            <button
              type="button"
              onClick={onCreatePR}
              className="statusbar-button statusbar-button--accent"
              title="Create pull request"
            >
              Create PR
            </button>
          )}
        </span>
      )}
      <span className="statusbar-spacer" />
      {activeSession && hiddenDockPanels.length > 0 && (
        <span className="statusbar-group">
          {hiddenDockPanels.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => dockLayout.togglePanel(id)}
              className="statusbar-button"
              title={`Show ${PANEL_LABELS[id]}`}
            >
              {PANEL_LABELS[id]}
            </button>
          ))}
        </span>
      )}
      <span className="statusbar-item">
        base: <span className="mono">{baseBranch}</span>
      </span>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="statusbar-button statusbar-icon-button"
          aria-label="Settings"
          title="Settings"
        >
          <span className="statusbar-icon">&#9881;</span>
        </button>
      )}
    </div>
  )
}
