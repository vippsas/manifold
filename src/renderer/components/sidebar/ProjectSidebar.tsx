import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
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
  onNewAgent: () => void
  onNewProject: () => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
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
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
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
      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        allProjectSessions={allProjectSessions}
        activeSessionId={activeSessionId}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
        onDeleteAgent={onDeleteAgent}
        onRemove={handleRemove}
        onUpdateProject={onUpdateProject}
        fetchingProjectId={fetchingProjectId}
        lastFetchedProjectId={lastFetchedProjectId}
        fetchResult={fetchResult}
        fetchError={fetchError}
        onFetchProject={onFetchProject}
      />
      <div style={sidebarStyles.actions}>
        <button onClick={onNewProject} style={sidebarStyles.actionButton}>
          + New Repository
        </button>
        <button onClick={onNewAgent} style={sidebarStyles.actionButtonPrimary}>
          + New Agent
        </button>
      </div>
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
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
}

function ProjectList({
  projects,
  activeProjectId,
  allProjectSessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onDeleteAgent,
  onRemove,
  onUpdateProject,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
}: ProjectListProps): React.JSX.Element {
  const handleProjectClick = useCallback(
    (projectId: string): void => {
      const sessions = allProjectSessions[projectId] ?? []
      if (sessions.length > 0) {
        onSelectSession(sessions[0].id, projectId)
      } else {
        onSelectProject(projectId)
      }
    },
    [allProjectSessions, onSelectProject, onSelectSession]
  )

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
              onSelect={handleProjectClick}
              onRemove={onRemove}
              onUpdateProject={onUpdateProject}
              isFetching={fetchingProjectId === project.id}
              fetchResult={lastFetchedProjectId === project.id ? fetchResult : null}
              fetchError={lastFetchedProjectId === project.id ? fetchError : null}
              onFetch={() => onFetchProject(project.id)}
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
          </React.Fragment>
        )
      })}
      {projects.length === 0 && (
        <div style={sidebarStyles.empty}>No repositories yet</div>
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
  isFetching: boolean
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetch: () => void
}

function ProjectItem({
  project,
  isActive,
  onSelect,
  onRemove,
  onUpdateProject,
  isFetching,
  fetchResult,
  fetchError,
  onFetch,
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
    <>
      <div
        onClick={handleClick}
        style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : undefined), position: 'relative' as const }}
        role="button"
        tabIndex={0}
      >
        <span className="truncate" style={sidebarStyles.itemName}>
          {project.name}
        </span>
        <div style={sidebarStyles.itemRight}>
          <button
            onClick={(e) => { e.stopPropagation(); onFetch() }}
            style={sidebarStyles.removeButton}
            aria-label={`Fetch ${project.name}`}
            title="Fetch latest from remote"
            disabled={isFetching}
          >
            {isFetching ? '...' : '\u21BB'}
          </button>
          <button
            onClick={handleGearClick}
            style={sidebarStyles.removeButton}
            aria-label={`Settings for ${project.name}`}
            title="Repository settings"
          >
            &#9881;
          </button>
          <button
            onClick={handleRemoveClick}
            style={sidebarStyles.removeButton}
            aria-label={`Remove ${project.name}`}
            title="Remove repository"
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


