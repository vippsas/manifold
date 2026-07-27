import React, { useCallback } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { DraftAgentItem } from './DraftAgentItem'
import { filterStandaloneProjectSessions } from '../../session-selection'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { ProjectItem } from './ProjectItem'
import { SidebarCardActions } from './SidebarCardActions'
import { dedupeSessionsByWorktree } from '../../hooks/agent-session/agent-siblings'
import { sortByRecency, useProjectRecency } from './sidebar-recency'

export interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  activeWorkspaceId?: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onRenameAgent: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onNewAgent: (projectId?: string, workspaceId?: string) => void
  onCreateWorkspaceFromProject?: (projectId: string) => Promise<void>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
}

export function ProjectList({
  projects,
  activeProjectId: activeProjectIdProp,
  activeWorkspaceId,
  suppressedProjectIds,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectProject,
  onSelectSession,
  onRequestDeleteAgent,
  onRenameAgent,
  onRemove,
  onUpdateProject,
  onNewAgent,
  onCreateWorkspaceFromProject,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
}: ProjectListProps): React.JSX.Element {
  const { recency, touchProject } = useProjectRecency()
  const visibleProjects = projects.filter((project) => !suppressedProjectIds?.has(project.id))

  // While a workspace is focused, its repos and sessions are shown under the
  // Workspaces section. Don't also highlight the workspace's home repo as an
  // active standalone project here — that double-highlights one repo.
  const activeProjectId = activeWorkspaceId ? null : activeProjectIdProp

  const handleProjectClick = useCallback(
    (projectId: string): void => {
      touchProject(projectId)
      // Only activate the project; let useAgentSession restore the agent that
      // was last viewed in this repo instead of resetting to the first one
      // (#768). Hard-coding sessions[0] here both overrode that restore and
      // corrupted the per-project memory.
      onSelectProject(projectId)
    },
    [onSelectProject, touchProject]
  )

  const orderedProjects = sortByRecency(visibleProjects, recency)

  const renderProjectCard = (project: Project): React.JSX.Element => {
    const isActive = project.id === activeProjectId
    const projectSessions = filterStandaloneProjectSessions(allProjectSessions[project.id] ?? [])
    const activeWorktreePath = isActive
      ? projectSessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null
      : null
    const primarySessions = dedupeSessionsByWorktree(projectSessions)
    return (
      <div className={`sidebar-project-group sidebar-project-group--has-agents${isActive ? ' sidebar-project-group--active' : ''}`}>
        <ProjectItem
          project={project}
          isActive={isActive}
          onSelect={handleProjectClick}
          onRemove={onRemove}
          onRename={(name) => onUpdateProject(project.id, { name })}
          onAddFolder={onCreateWorkspaceFromProject
            ? () => onCreateWorkspaceFromProject(project.id)
            : undefined}
        />
        {primarySessions.map((session) => {
          const siblingOutputting = projectSessions.some(
            (s) => s.worktreePath === session.worktreePath && outputtingSessionIds.has(s.id),
          )
          return (
            <AgentItem
              key={session.id}
              session={session}
              projectPath={project.path}
              isActive={session.worktreePath !== '' && session.worktreePath === activeWorktreePath}
              isOutputting={siblingOutputting}
              onSelect={(sessionId) => { touchProject(project.id); onSelectSession(sessionId, project.id) }}
              onDelete={() => onRequestDeleteAgent(session, project.path)}
              onRename={(settings) => onRenameAgent(session.id, settings)}
            />
          )
        })}
        {isActive && drafts
          .filter((d) => d.projectId === project.id)
          .map((d) => (
            <DraftAgentItem
              key={d.id}
              draft={d}
              isActive={d.id === activeDraftId}
              onSelect={onSelectDraft}
              onDiscard={onDiscardDraft}
            />
          ))}
        <SidebarCardActions
          label={project.name}
          onAddAgent={() => onNewAgent(project.id)}
        />
      </div>
    )
  }

  if (visibleProjects.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  return (
    <div style={sidebarStyles.list}>
      {orderedProjects.map((project) => {
        return <React.Fragment key={project.id}>{renderProjectCard(project)}</React.Fragment>
      })}
    </div>
  )
}
