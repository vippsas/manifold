import React from 'react'
import type { AgentSession, FileChange } from '../../shared/types'

interface StatusBarProps {
  activeSession: AgentSession | null
  changedFiles: FileChange[]
  baseBranch: string
}

export function StatusBar({
  activeSession,
  changedFiles,
  baseBranch,
}: StatusBarProps): React.JSX.Element {
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
}
