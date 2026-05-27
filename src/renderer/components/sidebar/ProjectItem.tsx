import React, { useCallback } from 'react'
import type { Project } from '../../../shared/types'
import { isGitProject } from '../../../shared/project-kind'
import { sidebarStyles } from './ProjectSidebar.styles'

interface ProjectItemProps {
  project: Project
  isActive: boolean
  onSelect: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  isFetching: boolean
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetch: () => void
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
}: ProjectItemProps): React.JSX.Element {
  const gitProject = isGitProject(project)

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
        <span className="truncate sidebar-row-label" style={sidebarStyles.itemName}>
          {project.name}
        </span>
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
      {fetchResult && (
        <div style={sidebarStyles.fetchMessage}>
          {fetchResult.commitCount > 0
            ? `Updated ${fetchResult.updatedBranch}: ${fetchResult.commitCount} new commit${fetchResult.commitCount !== 1 ? 's' : ''}`
            : `${fetchResult.updatedBranch} is up to date`}
        </div>
      )}
      {fetchError && (
        <div style={{ ...sidebarStyles.fetchMessage, color: 'var(--error, #f44)' }}>
          {fetchError}
        </div>
      )}
    </>
  )
}
