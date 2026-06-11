import React, { useCallback, useState } from 'react'
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
  isOutputting: boolean
  onSelect: (id: string) => void
  onDelete: () => void
  onRename?: (displayName: string) => void
  labelOverride?: string
  hideAdditionalDirs?: boolean
}

export function AgentItem({ session, projectPath, isActive, isOutputting, onSelect, onDelete, onRename, labelOverride, hideAdditionalDirs }: AgentItemProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const handleClick = useCallback((): void => {
    if (editing) return
    onSelect(session.id)
  }, [editing, onSelect, session.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (editing) return
        e.preventDefault()
        onSelect(session.id)
      }
    },
    [editing, onSelect, session.id]
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

  const displayName = session.displayName?.trim()
  const primaryLabel = displayName || labelOverride || formatBranchLabel(session.branchName, projectPath)
  const currentEditableLabel = displayName || primaryLabel
  const secondaryLabel = session.taskDescription
    ? `${session.taskDescription} \u00B7 ${runtimeLabel(session.runtimeId)}`
    : runtimeLabel(session.runtimeId)

  const startEditing = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      if (!onRename) return
      setDraft(currentEditableLabel)
      setEditing(true)
    },
    [currentEditableLabel, onRename],
  )

  const commitRename = useCallback((): void => {
    const nextName = draft.trim()
    if (nextName && nextName !== currentEditableLabel) {
      onRename?.(nextName)
    }
    setEditing(false)
  }, [currentEditableLabel, draft, onRename])

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setEditing(false)
      }
    },
    [commitRename],
  )

  const focusAndSelect = useCallback((el: HTMLInputElement | null): void => {
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`sidebar-item-row sidebar-agent-row ${session.status === 'done' || session.status === 'error' ? 'sidebar-agent-row--exited' : 'sidebar-agent-row--alive'}${isOutputting ? ' sidebar-agent-row--outputting' : ''}${isActive ? ' sidebar-item-row--active' : ''}`}
      title={displayName ? `${displayName} - ${session.branchName}` : `${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
      role="button"
      tabIndex={0}
    >
      <div className="sidebar-agent-main">
        <span className={`status-dot${session.status === 'done' || session.status === 'error' ? ' status-dot--hidden' : isOutputting ? ' status-dot--active' : ''}`} />
        {session.nonInteractive && (
          <span
            aria-label="Chat agent"
            title="Chat agent"
            style={{ marginRight: 4, opacity: 0.8, fontSize: 11 }}
          >
            ◐
          </span>
        )}
        {editing ? (
          <input
            ref={focusAndSelect}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleNameKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{ ...sidebarStyles.nameInput, ...sidebarStyles.agentNameInput }}
            aria-label="Agent name"
          />
        ) : (
          <span
            className="truncate sidebar-row-label"
            style={{
              ...sidebarStyles.agentBranch,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 400,
              flex: 1,
            }}
            onDoubleClick={(e) => { e.stopPropagation(); startEditing(e) }}
            title={onRename ? 'Double-click to rename' : undefined}
          >
            {primaryLabel}
          </span>
        )}
        <div className="sidebar-item-actions">
          {onRename && (
            <button
              type="button"
              onClick={startEditing}
              onKeyDown={stopKeyPropagation}
              className="sidebar-icon-button"
              style={sidebarStyles.agentRenameButton}
              aria-label={`Rename ${primaryLabel}`}
              title="Rename agent"
            >
              &#9998;
            </button>
          )}
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
      {!hideAdditionalDirs && session.additionalDirs.length > 0 && (
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
