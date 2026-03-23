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

export function formatBranchLabel(branchName: string, projectPath: string): string {
  const prefix = repoPrefix(projectPath)

  if (prefix && branchName.toLowerCase().startsWith(prefix)) {
    return branchName.slice(prefix.length)
  }

  return formatBranch(branchName)
}

export function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

interface AgentItemProps {
  session: AgentSession
  projectPath: string
  isActive: boolean
  onSelect: (id: string) => void
  onDelete: () => void
}

export function AgentItem({ session, projectPath, isActive, onSelect, onDelete }: AgentItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(session.id)
      }
    },
    [onSelect, session.id]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent): void => {
      e.stopPropagation()
      onDelete()
    },
    [onDelete]
  )

  const stopKeyPropagation = useCallback((e: React.KeyboardEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
  }, [])

  const primaryLabel = formatBranchLabel(session.branchName, projectPath)
  const secondaryLabel = session.taskDescription
    ? `${session.taskDescription} \u00B7 ${runtimeLabel(session.runtimeId)}`
    : runtimeLabel(session.runtimeId)

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`sidebar-item-row sidebar-agent-row${isActive ? ' sidebar-item-row--active' : ''}`}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
      role="button"
      tabIndex={0}
    >
      <div className="sidebar-agent-main">
        <span className={`status-dot status-dot--${session.status}`} />
        <span
          className="truncate sidebar-row-label"
          style={{
            ...sidebarStyles.agentBranch,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 600 : 400,
            flex: 1,
          }}
        >
          {primaryLabel}
        </span>
        <div className="sidebar-item-actions">
          <button
            type="button"
            onClick={handleDelete}
            onKeyDown={stopKeyPropagation}
            className="sidebar-icon-button"
            style={sidebarStyles.agentDeleteButton}
            aria-label={`Delete ${primaryLabel}`}
            title="Delete task"
          >
            &times;
          </button>
        </div>
      </div>
      <span
        className="truncate sidebar-secondary-text"
        style={{ paddingLeft: '16px' }}
      >
        {secondaryLabel}
      </span>
      {session.additionalDirs.length > 0 && (
        <div className="sidebar-aux-list">
          {session.additionalDirs.map((dir) => {
            const dirName = dir.split('/').filter(Boolean).pop() ?? dir
            return (
              <div
                key={dir}
                title={dir}
                className="truncate sidebar-aux-item"
              >
                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>+</span>
                {dirName}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
