import React from 'react'
import type { AgentSession, FileChange, AheadBehind } from '../../../shared/types'

interface StatusBarProps {
  activeSession: AgentSession | null
  changedFiles: FileChange[]
  baseBranch: string
  projectIsGit?: boolean
  conflicts?: string[]
  aheadBehind?: AheadBehind
  onCommit?: () => void
  onCreatePR?: () => void
  onShowConflicts?: () => void
  showCommitAndPrButtons?: boolean
}

export function StatusBar({
  activeSession,
  changedFiles,
  baseBranch,
  projectIsGit = true,
  conflicts = [],
  aheadBehind,
  onCommit,
  onCreatePR,
  onShowConflicts,
  showCommitAndPrButtons = false,
}: StatusBarProps): React.JSX.Element {
  const hasConflicts = conflicts.length > 0
  const hasChanges = changedFiles.length > 0
  const hasAhead = (aheadBehind?.ahead ?? 0) > 0

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
          ) : showCommitAndPrButtons && hasChanges && onCommit ? (
            <button
              type="button"
              onClick={onCommit}
              className="statusbar-button statusbar-button--success"
              title="Commit changes"
            >
              Commit
            </button>
          ) : null}
          {showCommitAndPrButtons && hasAhead && onCreatePR && (
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
      {projectIsGit && (
        <span className="statusbar-item">
          base: <span className="mono">{baseBranch}</span>
        </span>
      )}
    </div>
  )
}
