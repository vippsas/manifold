import React, { useCallback } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { DraftAgentItem } from './DraftAgentItem'
import { filterStandaloneProjectSessions, filterActiveStandaloneProjectSessions } from '../../session-selection'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { ProjectItem } from './ProjectItem'
import { FavoriteStarButton } from './FavoriteStarButton'
import { dedupeSessionsByWorktree } from '../../hooks/agent-session/agent-siblings'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { useSidebarSectionState } from './sidebar-section-state'
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
  onRenameAgent: (sessionId: string, displayName: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
  activeProjectBehindCount?: number
  onNewAgent: () => void
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
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
  activeProjectBehindCount,
  onNewAgent,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
}: ProjectListProps): React.JSX.Element {
  const [withAgentsExpanded, toggleWithAgentsExpanded] = useSidebarSectionState('withAgents', true)
  const [reposExpanded, toggleReposExpanded] = useSidebarSectionState('repositories', false)
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

  // The repo header only renders for the active project, so clicking it starts a
  // new agent in that repo — the same action as the "+ New Agent" button.
  const handleHeaderNewAgent = useCallback(
    (projectId: string): void => {
      touchProject(projectId)
      onNewAgent()
    },
    [onNewAgent, touchProject]
  )

  const activeProject = visibleProjects.find((p) => p.id === activeProjectId) ?? null

  // Repos with active standalone agents (including the active one), most recently
  // accessed first. The active repo renders in its recency slot rather than
  // being pinned, so the section doesn't reshuffle on every selection. Repos
  // whose agents have all finished drop out so the section reflects live work.
  const withAgentsProjects = sortByRecency(
    visibleProjects.filter(
      (p) => filterActiveStandaloneProjectSessions(allProjectSessions[p.id] ?? []).length > 0
    ),
    recency,
  )

  const inactiveProjects = visibleProjects.filter(
    (p) => p.id !== activeProjectId
      && filterActiveStandaloneProjectSessions(allProjectSessions[p.id] ?? []).length === 0
  )

  // When the active repo has active standalone agents it belongs under the "With
  // agents" header. When it has none, it stays pinned at the top so it isn't
  // hidden inside the collapsed "Repositories" list.
  const activeHasAgents = activeProject !== null
    && filterActiveStandaloneProjectSessions(allProjectSessions[activeProject.id] ?? []).length > 0

  const renderActiveProjectCard = (project: Project): React.JSX.Element => {
    const projectSessions = filterStandaloneProjectSessions(allProjectSessions[project.id] ?? [])
    const activeWorktreePath = projectSessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null
    const primarySessions = dedupeSessionsByWorktree(projectSessions)
    return (
      <div className="sidebar-project-group sidebar-project-group--active sidebar-project-group--has-agents">
        <ProjectItem
          project={project}
          isActive={true}
          onSelect={handleHeaderNewAgent}
          onRemove={onRemove}
          isFetching={fetchingProjectId === project.id}
          fetchResult={lastFetchedProjectId === project.id ? fetchResult : null}
          fetchError={lastFetchedProjectId === project.id ? fetchError : null}
          onFetch={() => onFetchProject(project.id)}
          behindCount={activeProjectBehindCount}
          onRename={(name) => onUpdateProject(project.id, { name })}
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
              onRename={(displayName) => onRenameAgent(session.id, displayName)}
            />
          )
        })}
        {drafts
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
      {activeProject !== null && !activeHasAgents && renderActiveProjectCard(activeProject)}

      {withAgentsProjects.length > 0 && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <SidebarSectionHeader
            label="With agents"
            count={withAgentsProjects.length}
            expanded={withAgentsExpanded}
            onToggle={toggleWithAgentsExpanded}
          />
          {withAgentsExpanded && (
            <>
              {withAgentsProjects.map((project) => {
                if (project.id === activeProjectId) {
                  return (
                    <React.Fragment key={project.id}>
                      {renderActiveProjectCard(project)}
                    </React.Fragment>
                  )
                }
                const projectSessions = filterStandaloneProjectSessions(allProjectSessions[project.id] ?? [])
                return (
                  <div
                    key={project.id}
                    style={sidebarStyles.collapsedProject}
                    onClick={() => handleProjectClick(project.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleProjectClick(project.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="sidebar-project-group sidebar-project-group--has-agents sidebar-project-group--collapsed"
                  >
                    <span
                      className="truncate sidebar-row-label"
                      style={{ ...sidebarStyles.item, color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
                    >
                      {project.name}
                    </span>
                    <div style={sidebarStyles.miniStatusDots}>
                      {projectSessions
                        .filter((session) => session.status !== 'done' && session.status !== 'error')
                        .map((session) => (
                          <span
                            key={session.id}
                            title={session.displayName?.trim() || session.branchName}
                            className={outputtingSessionIds.has(session.id) ? 'status-dot--active' : ''}
                            style={{ ...sidebarStyles.miniDot, background: 'var(--accent)' }}
                          />
                        ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {inactiveProjects.length > 0 && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <SidebarSectionHeader
            label="Repositories"
            count={inactiveProjects.length}
            expanded={reposExpanded}
            onToggle={toggleReposExpanded}
          />
          {reposExpanded && (
            <div style={sidebarStyles.inactiveList}>
              {inactiveProjects.map((project) => (
                <div
                  key={project.id}
                  style={sidebarStyles.collapsedProject}
                  onClick={() => handleProjectClick(project.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleProjectClick(project.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={project.path}
                  className="sidebar-inactive-project"
                >
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-small)', flex: 1, minWidth: 0 }}
                  >
                    {project.name}
                  </span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <FavoriteStarButton kind="repo" id={project.id} name={project.name} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
