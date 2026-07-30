import React, { useCallback, useState } from 'react'
import type { Project } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AddFolderGlyph, FilesChevronGlyph, NewAgentGlyph, RepoGlyph } from './SidebarCardActionGlyphs'

interface ProjectItemProps {
  project: Project
  /** Whether this repo's files are showing beneath it. */
  isFilesExpanded?: boolean
  /** The row is a folder header, like one of a VS Code workspace: it opens and
   *  closes the repo's files and nothing else. Selecting an agent is what makes
   *  a repo the one being worked in. */
  onSelect: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  onRename?: (name: string) => void
  onAddFolder?: () => void | Promise<void>
  onAddAgent?: () => void
}

export function ProjectItem({
  project,
  isFilesExpanded = false,
  onSelect,
  onRemove,
  onRename,
  onAddFolder,
  onAddAgent,
}: ProjectItemProps): React.JSX.Element {
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
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="sidebar-item-row sidebar-project-row"
      style={{ ...sidebarStyles.item, position: 'relative' as const }}
      role="button"
      tabIndex={0}
      aria-expanded={isFilesExpanded}
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
          <span style={sidebarStyles.rowChevron}><FilesChevronGlyph expanded={isFilesExpanded} /></span>
          <span style={sidebarStyles.rowGlyph}><RepoGlyph /></span>
          {project.name}
        </span>
      )}
      <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
        {onAddAgent && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddAgent() }}
            onKeyDown={stopKeyPropagation}
            className="sidebar-icon-button"
            style={sidebarStyles.addButton}
            aria-label={`Add agent to ${project.name}`}
            title="New agent"
          >
            <NewAgentGlyph />
          </button>
        )}
        {onAddFolder && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void onAddFolder() }}
            onKeyDown={stopKeyPropagation}
            className="sidebar-icon-button"
            style={sidebarStyles.addButton}
            aria-label={`Add folder to ${project.name}`}
            title="Add folder"
          >
            <AddFolderGlyph />
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
  )
}
