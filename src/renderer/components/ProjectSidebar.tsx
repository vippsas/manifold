import React, { useState, useCallback } from 'react'
import type { Project, AgentSession } from '../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sessions: AgentSession[]
  onSelectProject: (id: string) => void
  onAddProject: (path?: string) => void
  onRemoveProject: (id: string) => void
  onOpenSettings: () => void
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  sessions,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onOpenSettings,
}: ProjectSidebarProps): React.JSX.Element {
  const [cloneUrl, setCloneUrl] = useState('')
  const [showCloneInput, setShowCloneInput] = useState(false)

  const handleAddClick = useCallback((): void => {
    onAddProject()
  }, [onAddProject])

  const handleCloneSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (cloneUrl.trim()) {
        void window.electronAPI.invoke('projects:clone', cloneUrl.trim())
        setCloneUrl('')
        setShowCloneInput(false)
      }
    },
    [cloneUrl]
  )

  const getSessionCount = useCallback(
    (projectId: string): number => {
      return sessions.filter((s) => s.projectId === projectId).length
    },
    [sessions]
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  return (
    <div className="layout-sidebar" style={sidebarStyles.root}>
      <SidebarHeader onOpenSettings={onOpenSettings} />
      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        getSessionCount={getSessionCount}
        onSelectProject={onSelectProject}
        onRemove={handleRemove}
      />
      <SidebarActions onAdd={handleAddClick} onToggleClone={() => setShowCloneInput((p) => !p)} />
      {showCloneInput && (
        <CloneForm cloneUrl={cloneUrl} onUrlChange={setCloneUrl} onSubmit={handleCloneSubmit} />
      )}
    </div>
  )
}

function SidebarHeader({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  return (
    <div style={sidebarStyles.header}>
      <span style={sidebarStyles.title}>Projects</span>
      <button
        onClick={onOpenSettings}
        style={sidebarStyles.gearButton}
        aria-label="Settings"
        title="Settings"
      >
        &#9881;
      </button>
    </div>
  )
}

interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  getSessionCount: (id: string) => number
  onSelectProject: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
}

function ProjectList({
  projects,
  activeProjectId,
  getSessionCount,
  onSelectProject,
  onRemove,
}: ProjectListProps): React.JSX.Element {
  return (
    <div style={sidebarStyles.list}>
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
          sessionCount={getSessionCount(project.id)}
          onSelect={onSelectProject}
          onRemove={onRemove}
        />
      ))}
      {projects.length === 0 && (
        <div style={sidebarStyles.empty}>No projects yet</div>
      )}
    </div>
  )
}

interface ProjectItemProps {
  project: Project
  isActive: boolean
  sessionCount: number
  onSelect: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
}

function ProjectItem({
  project,
  isActive,
  sessionCount,
  onSelect,
  onRemove,
}: ProjectItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(project.id)
  }, [onSelect, project.id])

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent): void => {
      onRemove(e, project.id)
    },
    [onRemove, project.id]
  )

  return (
    <div
      onClick={handleClick}
      style={{
        ...sidebarStyles.item,
        background: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? '#ffffff' : 'var(--text-primary)',
      }}
      role="button"
      tabIndex={0}
    >
      <span className="truncate" style={sidebarStyles.itemName}>
        {project.name}
      </span>
      <div style={sidebarStyles.itemRight}>
        {sessionCount > 0 && (
          <span style={sidebarStyles.badge}>{sessionCount}</span>
        )}
        <button
          onClick={handleRemoveClick}
          style={sidebarStyles.removeButton}
          aria-label={`Remove ${project.name}`}
          title="Remove project"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

function SidebarActions({
  onAdd,
  onToggleClone,
}: {
  onAdd: () => void
  onToggleClone: () => void
}): React.JSX.Element {
  return (
    <div style={sidebarStyles.actions}>
      <button onClick={onAdd} style={sidebarStyles.actionButton}>
        + Add
      </button>
      <button onClick={onToggleClone} style={sidebarStyles.actionButton}>
        Clone
      </button>
    </div>
  )
}

function CloneForm({
  cloneUrl,
  onUrlChange,
  onSubmit,
}: {
  cloneUrl: string
  onUrlChange: (url: string) => void
  onSubmit: (e: React.FormEvent) => void
}): React.JSX.Element {
  return (
    <form onSubmit={onSubmit} style={sidebarStyles.cloneForm}>
      <input
        type="text"
        value={cloneUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="Git URL..."
        style={sidebarStyles.cloneInput}
        autoFocus
      />
      <button type="submit" style={sidebarStyles.cloneSubmit}>
        Go
      </button>
    </form>
  )
}

