import React, { useCallback } from 'react'
import type { AgentSession } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

function formatBranch(branchName: string): string {
  return branchName.replace(/^manifold\//, '')
}

function repoPrefix(projectPath: string): string {
  const repoName = projectPath.split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() ?? ''
  return repoName ? `${repoName}/` : ''
}

function formatBranchLabel(branchName: string, projectPath: string): string {
  const prefix = repoPrefix(projectPath)

  if (prefix && branchName.toLowerCase().startsWith(prefix)) {
    return branchName.slice(prefix.length)
  }

  return formatBranch(branchName)
}

function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

interface AgentItemProps {
  session: AgentSession
  projectPath: string
  isActive: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function AgentItem({ session, projectPath, isActive, onSelect, onDelete }: AgentItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  const handleDelete = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      onDelete(session.id)
    },
    [onDelete, session.id]
  )

  const primaryLabel = formatBranchLabel(session.branchName, projectPath)
  const secondaryLabel = session.taskDescription
    ? `${session.taskDescription} \u00B7 ${runtimeLabel(session.runtimeId)}`
    : runtimeLabel(session.runtimeId)

  return (
    <button
      onClick={handleClick}
      style={{
        ...sidebarStyles.agentItem,
        background: isActive ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
        opacity: isActive ? 1 : 0.6,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '2px',
        paddingTop: '6px',
        paddingBottom: '6px',
      }}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        <span className={`status-dot status-dot--${session.status}`} />
        <span
          className="truncate"
          style={{
            ...sidebarStyles.agentBranch,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 600 : 400,
            flex: 1,
          }}
        >
          {primaryLabel}
        </span>
        <span
          role="button"
          onClick={handleDelete}
          style={sidebarStyles.agentDeleteButton}
          aria-label={`Delete ${primaryLabel}`}
          title="Delete task"
        >
          &times;
        </span>
      </div>
      <span
        style={{
          fontSize: '0.92em',
          color: 'var(--text-muted)',
          paddingLeft: '14px',
          opacity: 0.8,
        }}
        className="truncate"
      >
        {secondaryLabel}
      </span>
      {session.additionalDirs.length > 0 && (
        <div style={{ paddingLeft: '14px', paddingTop: '2px' }}>
          {session.additionalDirs.map((dir) => {
            const dirName = dir.split('/').filter(Boolean).pop() ?? dir
            return (
              <div
                key={dir}
                title={dir}
                style={{
                  fontSize: '0.92em',
                  color: 'var(--text-muted)',
                  opacity: 0.7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  paddingTop: '1px',
                }}
                className="truncate"
              >
                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>+</span>
                {dirName}
              </div>
            )
          })}
        </div>
      )}
    </button>
  )
}
