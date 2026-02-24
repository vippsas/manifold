import React from 'react'
import type { AgentSession, FileChange, AheadBehind } from '../../shared/types'
import type { UseDockLayoutResult, DockPanelId } from '../hooks/useDockLayout'

const PANEL_LABELS: Record<DockPanelId, string> = {
  projects: 'Projects',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified',
  shell: 'Shell',
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
}: StatusBarProps): React.JSX.Element {
  const hasConflicts = conflicts.length > 0
  const hasChanges = changedFiles.length > 0
  const hasAhead = (aheadBehind?.ahead ?? 0) > 0

  const hiddenDockPanels = dockLayout.hiddenPanels

  return (
    <div className="layout-status-bar">
      {activeSession ? (
        <>
          <span style={barStyles.item}>
            <span className={`status-dot status-dot--${activeSession.status}`} />
            <span className="mono" style={barStyles.branch}>
              {activeSession.branchName}
            </span>
          </span>
          <span style={barStyles.item}>
            {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
          </span>
        </>
      ) : (
        <span style={barStyles.item}>No active agent</span>
      )}
      {activeSession && (
        <span style={barStyles.gitActions}>
          {hasConflicts && onShowConflicts ? (
            <button
              onClick={onShowConflicts}
              style={barStyles.conflictButton}
              title="Resolve merge conflicts"
            >
              Conflicts ({conflicts.length})
            </button>
          ) : hasChanges && onCommit ? (
            <button
              onClick={onCommit}
              style={barStyles.commitButton}
              title="Commit changes"
            >
              Commit
            </button>
          ) : null}
          {hasAhead && onCreatePR && (
            <button
              onClick={onCreatePR}
              style={barStyles.prButton}
              title="Create pull request"
            >
              Create PR
            </button>
          )}
        </span>
      )}
      <span style={barStyles.spacer} />
      {activeSession && hiddenDockPanels.length > 0 && (
        <span style={barStyles.toggleGroup}>
          {hiddenDockPanels.map((id) => (
            <button
              key={id}
              onClick={() => dockLayout.togglePanel(id)}
              style={barStyles.toggleButton}
              title={`Show ${PANEL_LABELS[id]}`}
            >
              {PANEL_LABELS[id]}
            </button>
          ))}
        </span>
      )}
      <span style={barStyles.item}>
        base: <span className="mono">{baseBranch}</span>
      </span>
    </div>
  )
}

type BarStyleKey =
  | 'item'
  | 'branch'
  | 'spacer'
  | 'toggleGroup'
  | 'toggleButton'
  | 'gitActions'
  | 'commitButton'
  | 'prButton'
  | 'conflictButton'

const barStyles: Record<BarStyleKey, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  branch: {
    fontSize: '11px',
  },
  spacer: {
    flex: 1,
  },
  toggleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  toggleButton: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    color: 'var(--accent)',
    background: 'rgba(79, 195, 247, 0.12)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  gitActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  commitButton: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '3px',
    color: 'var(--success)',
    background: 'rgba(102, 187, 106, 0.15)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  prButton: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '3px',
    color: 'var(--accent)',
    background: 'rgba(79, 195, 247, 0.15)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  conflictButton: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '3px',
    color: 'var(--warning)',
    background: 'rgba(255, 167, 38, 0.15)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
}
