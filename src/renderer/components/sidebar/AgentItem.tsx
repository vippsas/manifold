import React, { useCallback, useState } from 'react'
import type { AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import { ConfigureAgentGlyph, FilesChevronGlyph } from './SidebarCardActionGlyphs'
import { InPlaceBadge } from './InPlaceBadge'
import { AgentSettingsModal } from '../modals/AgentSettingsModal'

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
  /** Whether this agent's worktree is showing its files beneath the row. */
  isFilesExpanded?: boolean
  /** Opens and closes the worktree's files. Absent for an in-place agent, whose
   *  files are the repo's own checkout. */
  onToggleFiles?: () => void
  onSelect: (id: string) => void
  onDelete: () => void
  onRename?: (settings: AgentSettingsUpdate) => Promise<void> | void
  labelOverride?: string
  hideAdditionalDirs?: boolean
}

export function AgentItem({ session, projectPath, isActive, isOutputting, isFilesExpanded = false, onToggleFiles, onSelect, onDelete, onRename, labelOverride, hideAdditionalDirs }: AgentItemProps): React.JSX.Element {
  const [settingsVisible, setSettingsVisible] = useState(false)

  // The row is both the agent and its folder: clicking it selects the agent and
  // shows the files of its worktree, the way clicking a repo shows the repo's.
  const handleClick = useCallback((): void => {
    onSelect(session.id)
    onToggleFiles?.()
  }, [onSelect, onToggleFiles, session.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
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
  const secondaryLabel = session.taskDescription
    ? `${session.taskDescription} \u00B7 ${runtimeLabel(session.runtimeId)}`
    : runtimeLabel(session.runtimeId)

  return (
    <>
      <div
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`sidebar-item-row sidebar-agent-row ${session.status === 'done' || session.status === 'error' ? 'sidebar-agent-row--exited' : 'sidebar-agent-row--alive'}${isOutputting ? ' sidebar-agent-row--outputting' : ''}${isActive ? ' sidebar-item-row--active' : ''}`}
        title={displayName ? `${displayName} - ${session.branchName}` : `${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
        role="button"
        tabIndex={0}
      >
        <div className="sidebar-agent-main">
          {onToggleFiles && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onToggleFiles() }}
              onKeyDown={stopKeyPropagation}
              className="sidebar-files-toggle"
              aria-expanded={isFilesExpanded}
              aria-label={`${isFilesExpanded ? 'Hide' : 'Show'} files in ${session.branchName}`}
              title="Worktree files"
            >
              <FilesChevronGlyph expanded={isFilesExpanded} />
            </button>
          )}
          {session.nonInteractive && (
            <span
              aria-label="Chat agent"
              title="Chat agent"
              style={{ marginRight: 4, opacity: 0.8, fontSize: 11 }}
            >
              ◐
            </span>
          )}
          <span
            className="truncate sidebar-row-label"
            style={{
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              flex: 1,
            }}
          >
            {primaryLabel}
          </span>
          {session.noWorktree && (
            <InPlaceBadge
              label="in-place"
              description="In-place — runs in the repository directly (no worktree)"
            />
          )}
          <div className="sidebar-item-actions">
            {onRename && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setSettingsVisible(true) }}
                onKeyDown={stopKeyPropagation}
                className="sidebar-icon-button"
                aria-label={`Settings for ${primaryLabel}`}
                title="Agent settings"
              >
                <ConfigureAgentGlyph />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              onKeyDown={stopKeyPropagation}
              className="sidebar-icon-button"
              aria-label={`Delete ${primaryLabel}`}
              title="Delete task"
            >
              &times;
            </button>
          </div>
        </div>
        <span className="truncate sidebar-secondary-text">{secondaryLabel}</span>
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
      {onRename && (
        <AgentSettingsModal
          visible={settingsVisible}
          session={session}
          fallbackName={primaryLabel}
          onSave={onRename}
          onClose={() => setSettingsVisible(false)}
        />
      )}
    </>
  )
}
