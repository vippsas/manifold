import React from 'react'
import type { AgentSession, FileChange } from '../../shared/types'
import type { PaneVisibility, PaneName } from '../hooks/usePaneResize'

const PANE_LABELS: Record<PaneName, string> = {
  sidebar: 'Sidebar',
  left: 'Agent',
  center: 'Editor',
  right: 'Files',
  bottom: 'Shell',
}

const ALL_VISIBLE: PaneVisibility = { sidebar: true, left: true, center: true, right: true, bottom: true }

interface StatusBarProps {
  activeSession: AgentSession | null
  changedFiles: FileChange[]
  baseBranch: string
  paneVisibility?: PaneVisibility
  onTogglePane?: (pane: PaneName) => void
}

export function StatusBar({
  activeSession,
  changedFiles,
  baseBranch,
  paneVisibility = ALL_VISIBLE,
  onTogglePane,
}: StatusBarProps): React.JSX.Element {
  const hiddenPanes = (Object.keys(paneVisibility) as PaneName[]).filter(
    (pane) => !paneVisibility[pane]
  )

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
      <span style={barStyles.spacer} />
      {hiddenPanes.length > 0 && onTogglePane && (
        <span style={barStyles.toggleGroup}>
          {hiddenPanes.map((pane) => (
            <button
              key={pane}
              onClick={() => onTogglePane(pane)}
              style={barStyles.toggleButton}
              title={`Show ${PANE_LABELS[pane]}`}
            >
              {PANE_LABELS[pane]}
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

const barStyles: Record<string, React.CSSProperties> = {
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
}
