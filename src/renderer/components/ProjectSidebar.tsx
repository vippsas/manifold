import React, { useState, useCallback } from 'react'
import type { Project, AgentSession } from '../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (id: string) => void
  onAddProject: (path?: string) => void
  onRemoveProject: (id: string) => void
  onNewAgent: () => void
  onOpenSettings: () => void
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onAddProject,
  onRemoveProject,
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
        sessions={sessions}
        activeSessionId={activeSessionId}
        getSessionCount={getSessionCount}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
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
  sessions: AgentSession[]
  activeSessionId: string | null
  getSessionCount: (id: string) => number
  onSelectProject: (id: string) => void
  onSelectSession: (id: string) => void
  onNewAgent: () => void
  onRemove: (e: React.MouseEvent, id: string) => void
}

function ProjectList({
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  getSessionCount,
  onSelectProject,
  onSelectSession,
  onNewAgent,
  onRemove,
}: ProjectListProps): React.JSX.Element {
  return (
    <div style={sidebarStyles.list}>
      {projects.map((project) => {
        const isActive = project.id === activeProjectId
        const projectSessions = isActive
          ? sessions.filter((s) => s.projectId === project.id)
          : []

        return (
          <React.Fragment key={project.id}>
            <ProjectItem
              project={project}
              isActive={isActive}
              sessionCount={isActive ? 0 : getSessionCount(project.id)}
              onSelect={onSelectProject}
              onRemove={onRemove}
            />
            {isActive && projectSessions.map((session) => (
              <AgentItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={onSelectSession}
              />
            ))}
            {isActive && (
              <button onClick={onNewAgent} style={sidebarStyles.newAgentButton}>
                + New Agent
              </button>
            )}
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
}

function AgentItem({ session, isActive, onSelect }: AgentItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  return (
    <button
      onClick={handleClick}
      style={{
        ...sidebarStyles.agentItem,
        background: isActive ? 'var(--bg-input)' : 'transparent',
      }}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
    >
      <span className={`status-dot status-dot--${session.status}`} />
      <span className="truncate" style={sidebarStyles.agentBranch}>
        {formatBranch(session.branchName)}
      </span>
      <span style={sidebarStyles.agentRuntime}>{runtimeLabel(session.runtimeId)}</span>
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

