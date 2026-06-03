import React, { useCallback, useState } from 'react'
import type { Project } from '../../../shared/types'
import { isGitProject } from '../../../shared/project-kind'
import { sidebarStyles } from './ProjectSidebar.styles'
import { FetchMessage } from './FetchMessage'

interface ProjectItemProps {
  project: Project
  isActive: boolean
  onSelect: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  isFetching: boolean
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetch: () => void
  onRename?: (name: string) => void
}

export function ProjectItem({
  project,
  isActive,
  onSelect,
  onRemove,
  isFetching,
  fetchResult,
  fetchError,
  onFetch,
  onRename,
}: ProjectItemProps): React.JSX.Element {
  const gitProject = isGitProject(project)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEditing = useCallback((): void => {
    if (!onRename) return
    setDraft(project.name)
    setEditing(true)
  }, [onRename, project.name])

  const focusAndSelect = useCallback((el: HTMLInputElement | null): void => {
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  const commitRename = useCallback((): void => {
    const next = draft.trim()
    if (next && next !== project.name) onRename?.(next)
    setEditing(false)
  }, [draft, project.name, onRename])

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
    [commitRename]
  )

  const handleClick = useCallback((): void => {
    onSelect(project.id)
  }, [onSelect, project.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(project.id)
      }
    },
    [onSelect, project.id]
  )

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent): void => {
      onRemove(e, project.id)
    },
    [onRemove, project.id]
  )

  const stopKeyPropagation = useCallback((e: React.KeyboardEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
  }, [])

  return (
    <>
      <div
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`sidebar-item-row sidebar-project-row${isActive ? ' sidebar-item-row--active' : ''}`}
        style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : undefined), position: 'relative' as const }}
        role="button"
        tabIndex={0}
      >
        {editing ? (
          <input
            ref={focusAndSelect}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleNameKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={sidebarStyles.nameInput}
            aria-label="Repository name"
          />
        ) : (
          <span
            className="truncate sidebar-row-label"
            style={sidebarStyles.itemName}
            onDoubleClick={(e) => { e.stopPropagation(); startEditing() }}
            title={onRename ? 'Double-click to rename' : undefined}
          >
            {project.name}
          </span>
        )}
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
          {gitProject && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFetch() }}
              onKeyDown={stopKeyPropagation}
              className="sidebar-icon-button"
              style={sidebarStyles.removeButton}
              aria-label={`Fetch ${project.name}`}
              title="Fetch latest from remote"
              disabled={isFetching}
            >
              {isFetching ? '...' : '↻'}
            </button>
          )}
          <button
            type="button"
            onClick={handleRemoveClick}
            onKeyDown={stopKeyPropagation}
            className="sidebar-icon-button"
            style={sidebarStyles.removeButton}
            aria-label={`Remove ${project.name}`}
            title="Remove repository"
          >
            &times;
          </button>
        </div>
      </div>
      <FetchMessage result={fetchResult} error={fetchError} />
    </>
  )
}
