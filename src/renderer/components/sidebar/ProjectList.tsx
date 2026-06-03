import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { DraftAgentItem } from './DraftAgentItem'
import { filterStandaloneProjectSessions } from '../../session-selection'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { ProjectItem } from './ProjectItem'
import { FavoriteStarButton } from './FavoriteStarButton'
import { dedupeSessionsByWorktree } from '../../hooks/agent-siblings'

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
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
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
  onRemove,
  onUpdateProject,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
}: ProjectListProps): React.JSX.Element {
  const [reposExpanded, setReposExpanded] = useState(false)
  const visibleProjects = projects.filter((project) => !suppressedProjectIds?.has(project.id))

  // While a workspace is focused, its repos and sessions are shown under the
  // Workspaces section. Don't also highlight the workspace's home repo as an
  // active standalone project here — that double-highlights one repo.
  const activeProjectId = activeWorkspaceId ? null : activeProjectIdProp

  const handleProjectClick = useCallback(
    (projectId: string): void => {
      const sessions = filterStandaloneProjectSessions(allProjectSessions[projectId] ?? [])
      if (sessions.length > 0) {
        onSelectSession(sessions[0].id, projectId)
      } else {
        onSelectProject(projectId)
      }
    },
    [allProjectSessions, onSelectProject, onSelectSession]
  )

  const activeProject = visibleProjects.find((p) => p.id === activeProjectId) ?? null

  const withAgentsProjects = visibleProjects.filter(
    (p) => p.id !== activeProjectId
      && filterStandaloneProjectSessions(allProjectSessions[p.id] ?? []).length > 0
  )

  const inactiveProjects = visibleProjects.filter(
    (p) => p.id !== activeProjectId
      && filterStandaloneProjectSessions(allProjectSessions[p.id] ?? []).length === 0
  )

  // When the active repo has standalone agents it belongs under the "With agents"
  // header (rendered first, expanded). When it has none, it stays pinned at the
  // top so it isn't hidden inside the collapsed "Repositories" list.
  const activeHasAgents = activeProject !== null
    && filterStandaloneProjectSessions(allProjectSessions[activeProject.id] ?? []).length > 0

  const renderActiveProjectCard = (project: Project): React.JSX.Element => {
    const projectSessions = filterStandaloneProjectSessions(allProjectSessions[project.id] ?? [])
    const activeWorktreePath = projectSessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null
    const primarySessions = dedupeSessionsByWorktree(projectSessions)
    return (
      <div className="sidebar-project-group sidebar-project-group--active sidebar-project-group--has-agents">
        <ProjectItem
          project={project}
          isActive={true}
          onSelect={handleProjectClick}
          onRemove={onRemove}
          isFetching={fetchingProjectId === project.id}
          fetchResult={lastFetchedProjectId === project.id ? fetchResult : null}
          fetchError={lastFetchedProjectId === project.id ? fetchError : null}
          onFetch={() => onFetchProject(project.id)}
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
              onSelect={(sessionId) => onSelectSession(sessionId, project.id)}
              onDelete={() => onRequestDeleteAgent(session, project.path)}
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

      {(activeHasAgents || withAgentsProjects.length > 0) && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <div style={sidebarStyles.sectionLabel}>With agents</div>
          {activeProject !== null && activeHasAgents && renderActiveProjectCard(activeProject)}
          {withAgentsProjects.map((project) => {
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
                        title={session.branchName}
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

      {inactiveProjects.length > 0 && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <div
            style={sidebarStyles.sectionLabelToggle}
            onClick={() => setReposExpanded((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setReposExpanded((prev) => !prev)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              style={{
                transform: reposExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.1s ease',
                flexShrink: 0,
              }}
            >
              <path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Repositories</span>
            <span style={sidebarStyles.sectionCount}>{inactiveProjects.length}</span>
          </div>
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
                  <span className="sidebar-item-actions" style={{ marginLeft: 'auto', flexShrink: 0 }}>
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
