import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { ProjectSettingsPopover } from './ProjectSettingsPopover'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onDeleteAgent: (id: string) => void
  onNewAgent: (projectId: string) => void
  onNewProject: () => void
  onOpenSettings: () => void
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  allProjectSessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onRemoveProject,
  onUpdateProject,
  onDeleteAgent,
  onNewAgent,
  onNewProject,
  onOpenSettings,
}: ProjectSidebarProps): React.JSX.Element {
  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  return (
    <div style={sidebarStyles.root}>
      <SidebarHeader onOpenSettings={onOpenSettings} />
      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        allProjectSessions={allProjectSessions}
        activeSessionId={activeSessionId}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
        onDeleteAgent={onDeleteAgent}
        onNewAgent={onNewAgent}
        onRemove={handleRemove}
        onUpdateProject={onUpdateProject}
      />
      <div style={sidebarStyles.actions}>
        <button onClick={onNewProject} style={sidebarStyles.actionButton}>
          + New Project
        </button>
      </div>
    </div>
  )
}

function SidebarHeader({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  return (
    <div style={sidebarStyles.header}>
      <span style={sidebarStyles.title}>Projects</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={onOpenSettings}
          style={sidebarStyles.gearButton}
          aria-label="Settings"
          title="Settings"
        >
          &#9881;
        </button>
      </span>
    </div>
  )
}

interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onDeleteAgent: (id: string) => void
  onNewAgent: (projectId: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
}

function ProjectList({
  projects,
  activeProjectId,
  allProjectSessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onDeleteAgent,
  onNewAgent,
  onRemove,
  onUpdateProject,
}: ProjectListProps): React.JSX.Element {
  return (
    <div style={sidebarStyles.list}>
      {projects.map((project) => {
        const isActive = project.id === activeProjectId
        const projectSessions = allProjectSessions[project.id] ?? []

        return (
          <React.Fragment key={project.id}>
            <ProjectItem
              project={project}
              isActive={isActive}
              onSelect={onSelectProject}
              onRemove={onRemove}
              onUpdateProject={onUpdateProject}
            />
            {projectSessions.map((session) => (
              <AgentItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={(sessionId) => onSelectSession(sessionId, project.id)}
                onDelete={onDeleteAgent}
              />
            ))}
            <button onClick={() => onNewAgent(project.id)} style={sidebarStyles.newAgentButton}>
              + New Agent
            </button>
          </React.Fragment>
        )
      })}
      {projects.length === 0 && (
        <div style={sidebarStyles.empty}>No projects yet</div>
      )}
    </div>
  )
}

interface ProjectItemProps {
  project: Project
  isActive: boolean
  onSelect: (id: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
}

function ProjectItem({
  project,
  isActive,
  onSelect,
  onRemove,
  onUpdateProject,
}: ProjectItemProps): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false)

  const handleClick = useCallback((): void => {
    onSelect(project.id)
  }, [onSelect, project.id])

  const handleGearClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      setShowSettings((prev) => !prev)
    },
    []
  )

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent): void => {
      onRemove(e, project.id)
    },
    [onRemove, project.id]
  )

  return (
    <div
      onClick={handleClick}
      style={{ ...sidebarStyles.item, position: 'relative' as const }}
      role="button"
      tabIndex={0}
    >
      <span className="truncate" style={sidebarStyles.itemName}>
        {project.name}
      </span>
      <div style={sidebarStyles.itemRight}>
        <button
          onClick={handleGearClick}
          style={sidebarStyles.removeButton}
          aria-label={`Settings for ${project.name}`}
          title="Project settings"
        >
          &#9881;
        </button>
        <button
          onClick={handleRemoveClick}
          style={sidebarStyles.removeButton}
          aria-label={`Remove ${project.name}`}
          title="Remove project"
        >
          &times;
        </button>
      </div>
      {showSettings && (
        <ProjectSettingsPopover
          project={project}
          onUpdateProject={onUpdateProject}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}


