import React, { useCallback, useState } from 'react'
import type { AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import { ConfigureAgentGlyph } from './SidebarCardActionGlyphs'
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
  onSelect: (id: string) => void
  onDelete: () => void
  onRename?: (settings: AgentSettingsUpdate) => Promise<void> | void
  labelOverride?: string
  hideAdditionalDirs?: boolean
}

export function AgentItem({ session, projectPath, isActive, isOutputting, onSelect, onDelete, onRename, labelOverride, hideAdditionalDirs }: AgentItemProps): React.JSX.Element {
  const [settingsVisible, setSettingsVisible] = useState(false)

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
          <span
            className="truncate sidebar-row-label"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              flex: 1,
            }}
          >
            {primaryLabel}
          </span>
          {session.noWorktree && (
            <span
              className="sidebar-agent-inplace-badge"
              aria-label="In-place agent — runs in the repository without a worktree"
              title="In-place — runs in the repository directly (no worktree)"
              style={{
                flexShrink: 0,
                marginLeft: 6,
                padding: '1px 6px',
                fontSize: 'var(--type-ui-micro)',
                lineHeight: 1.5,
                color: 'var(--accent)',
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent-dim, var(--accent))',
                borderRadius: 'var(--radius-pill)',
                letterSpacing: '0.2px',
              }}
            >
              in-place
            </span>
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
