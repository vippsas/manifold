import React, { useState, useCallback } from 'react'
import type { Project, AgentSession } from '../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'

interface ProjectSidebarProps {
  width: number
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onAddProject: (path?: string) => void
  onRemoveProject: (id: string) => void
  onCloneProject: (url: string) => void
  onDeleteAgent: (id: string) => void
  onNewAgent: (projectId: string) => void
  onOpenSettings: () => void
}

export function ProjectSidebar({
  width,
  projects,
  activeProjectId,
  allProjectSessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onAddProject,
  onRemoveProject,
  onCloneProject,
  onDeleteAgent,
  onNewAgent,
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
        onCloneProject(cloneUrl.trim())
        setCloneUrl('')
        setShowCloneInput(false)
      }
    },
    [cloneUrl, onCloneProject]
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  return (
    <div className="layout-sidebar" style={{ ...sidebarStyles.root, width }}>
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
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onDeleteAgent: (id: string) => void
  onNewAgent: (projectId: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
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
}

function ProjectItem({
  project,
  isActive,
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
      style={sidebarStyles.item}
      role="button"
      tabIndex={0}
    >
      <span className="truncate" style={sidebarStyles.itemName}>
        {project.name}
      </span>
      <div style={sidebarStyles.itemRight}>
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

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  custom: 'Custom',
}

function formatBranch(branchName: string): string {
  return branchName.replace('manifold/', '')
}

function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

interface AgentItemProps {
  session: AgentSession
  isActive: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function AgentItem({ session, isActive, onSelect, onDelete }: AgentItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  const handleDelete = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      onDelete(session.id)
    },
    [onDelete, session.id]
  )

  return (
    <button
      onClick={handleClick}
      style={{
        ...sidebarStyles.agentItem,
        background: isActive ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
        opacity: isActive ? 1 : 0.6,
      }}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
    >
      <span className={`status-dot status-dot--${session.status}`} />
      <span
        className="truncate"
        style={{
          ...sidebarStyles.agentBranch,
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {formatBranch(session.branchName)}
      </span>
      <span
        style={{
          ...sidebarStyles.agentRuntime,
          color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        {runtimeLabel(session.runtimeId)}
      </span>
      <span
        role="button"
        onClick={handleDelete}
        style={sidebarStyles.agentDeleteButton}
        aria-label={`Delete ${formatBranch(session.branchName)}`}
        title="Delete agent"
      >
        &times;
      </span>
    </button>
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

