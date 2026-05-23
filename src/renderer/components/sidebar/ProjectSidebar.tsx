import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { isGitProject } from '../../../shared/project-kind'
import {
  collectSuperagentChildSessionIds,
  collectSuperagentFleetProjectIds,
  collectSuperagentFleetWorktreePaths,
  filterStandaloneProjectSessions,
  type SessionSelectionOptions,
} from '../../session-selection'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { SuperagentList } from './SuperagentList'
import { dedupeSessionsByWorktree } from '../../hooks/agent-siblings'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string, options?: SessionSelectionOptions) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgent: () => void
  onNewProject: () => void
  superagents?: Superagent[]
  activeSuperagentId?: string | null
  onSelectSuperagent?: (id: string) => void
  onRemoveSuperagent?: (id: string) => Promise<void>
  onRequestAddProjectToSuperagent?: (superagentId: string) => void
  onSpawnFleetAgent?: (superagentId: string, projectId: string) => Promise<void>
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  suppressedProjectIds,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectProject,
  onSelectSession,
  onRemoveProject,
  onUpdateProject,
  onRequestDeleteAgent,
  onNewAgent,
  onNewProject,
  superagents,
  activeSuperagentId,
  onSelectSuperagent,
  onRemoveSuperagent,
  onRequestAddProjectToSuperagent,
  onSpawnFleetAgent,
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
      {superagents && onSelectSuperagent && (
        <SuperagentList
          superagents={superagents}
          projects={projects}
          activeSuperagentId={activeSuperagentId ?? null}
          onSelect={onSelectSuperagent}
          onRemove={onRemoveSuperagent}
          allProjectSessions={allProjectSessions}
          activeSessionId={activeSessionId}
          outputtingSessionIds={outputtingSessionIds}
          onSelectSession={onSelectSession}
          onRequestAddProject={onRequestAddProjectToSuperagent}
          onSpawnFleetAgent={onSpawnFleetAgent}
          onDeleteAgent={onRequestDeleteAgent}
        />
      )}
        <ProjectList
          projects={projects}
          activeProjectId={activeSuperagentId ? null : activeProjectId}
          suppressedProjectIds={suppressedProjectIds}
          allProjectSessions={allProjectSessions}
        activeSessionId={activeSessionId}
        outputtingSessionIds={outputtingSessionIds}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
        onRequestDeleteAgent={onRequestDeleteAgent}
        onRemove={handleRemove}
        onUpdateProject={onUpdateProject}
        superagents={superagents}
        fetchingProjectId={fetchingProjectId}
        lastFetchedProjectId={lastFetchedProjectId}
        fetchResult={fetchResult}
        fetchError={fetchError}
        onFetchProject={onFetchProject}
      />
      <div style={sidebarStyles.actions}>
        <button type="button" onClick={onNewAgent} className="sidebar-action-button sidebar-action-button--primary" style={sidebarStyles.actionButtonPrimary}>
          + New Agent
        </button>
        <button type="button" onClick={onNewProject} className="sidebar-action-button" style={sidebarStyles.actionButton}>
          + New Repository
        </button>
      </div>
    </div>
  )
}

interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string, options?: SessionSelectionOptions) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  superagents?: Superagent[]
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
}

function ProjectList({
  projects,
  activeProjectId,
  suppressedProjectIds,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectProject,
  onSelectSession,
  onRequestDeleteAgent,
  onRemove,
  onUpdateProject,
  superagents,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
}: ProjectListProps): React.JSX.Element {
  const [reposExpanded, setReposExpanded] = useState(false)
  const superagentChildSessionIds = collectSuperagentChildSessionIds(superagents)
  const superagentFleetWorktreePaths = collectSuperagentFleetWorktreePaths(superagents)
  const superagentFleetProjectIds = collectSuperagentFleetProjectIds(superagents)
  const visibleProjects = projects.filter((project) => !suppressedProjectIds?.has(project.id))

  const handleProjectClick = useCallback(
    (projectId: string): void => {
      const sessions = filterStandaloneProjectSessions(
        allProjectSessions[projectId] ?? [],
        superagentChildSessionIds,
        superagentFleetWorktreePaths,
      )
      if (sessions.length > 0) {
        onSelectSession(sessions[0].id, projectId)
      } else {
        onSelectProject(projectId)
      }
    },
    [allProjectSessions, onSelectProject, onSelectSession, superagentChildSessionIds, superagentFleetWorktreePaths]
  )

  // Tier 1: currently active project
  const activeProject = visibleProjects.find((p) => p.id === activeProjectId) ?? null

  // Tier 2: other projects that have running sessions
  const withAgentsProjects = visibleProjects.filter(
    (p) => p.id !== activeProjectId
      && filterStandaloneProjectSessions(
        allProjectSessions[p.id] ?? [],
        superagentChildSessionIds,
        superagentFleetWorktreePaths,
      ).length > 0
  )

  // Tier 3: projects with no sessions. Excludes projects owned by any superagent
  // fleet — those are reachable via the superagent and would otherwise create a
  // standalone session in a fleet-reserved worktree that the sidebar then hides.
  const inactiveProjects = visibleProjects.filter(
    (p) => p.id !== activeProjectId
      && !superagentFleetProjectIds.has(p.id)
      && filterStandaloneProjectSessions(
        allProjectSessions[p.id] ?? [],
        superagentChildSessionIds,
        superagentFleetWorktreePaths,
      ).length === 0
  )

  if (visibleProjects.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  return (
    <div style={sidebarStyles.list}>
      {/* Tier 1: Active project — expanded with agents */}
      {activeProject !== null && (() => {
        const projectSessions = filterStandaloneProjectSessions(
          allProjectSessions[activeProject.id] ?? [],
          superagentChildSessionIds,
          superagentFleetWorktreePaths,
        )
        const activeWorktreePath = projectSessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null
        const primarySessions = dedupeSessionsByWorktree(projectSessions)
        return (
          <div className="sidebar-project-group sidebar-project-group--active sidebar-project-group--has-agents">
            <ProjectItem
              project={activeProject}
              isActive={true}
              onSelect={handleProjectClick}
              onRemove={onRemove}

              isFetching={fetchingProjectId === activeProject.id}
              fetchResult={lastFetchedProjectId === activeProject.id ? fetchResult : null}
              fetchError={lastFetchedProjectId === activeProject.id ? fetchError : null}
              onFetch={() => onFetchProject(activeProject.id)}
            />
            {primarySessions.map((session) => {
              const siblingOutputting = projectSessions.some(
                (s) => s.worktreePath === session.worktreePath && outputtingSessionIds.has(s.id),
              )
              return (
                <AgentItem
                  key={session.id}
                  session={session}
                  projectPath={activeProject.path}
                  isActive={session.worktreePath !== '' && session.worktreePath === activeWorktreePath}
                  isOutputting={siblingOutputting}
                  onSelect={(sessionId) => onSelectSession(sessionId, activeProject.id)}
                  onDelete={() => onRequestDeleteAgent(session, activeProject.path)}
                />
              )
            })}
          </div>
        )
      })()}

      {/* Tier 2: Other projects with agents — collapsed with mini status dots */}
      {withAgentsProjects.length > 0 && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <div style={sidebarStyles.sectionLabel}>With agents</div>
          {withAgentsProjects.map((project) => {
            const projectSessions = filterStandaloneProjectSessions(
              allProjectSessions[project.id] ?? [],
              superagentChildSessionIds,
              superagentFleetWorktreePaths,
            )
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
                        style={{
                          ...sidebarStyles.miniDot,
                          background: 'var(--accent)',
                        }}
                      />
                    ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Tier 3: Inactive projects — collapsed by default */}
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
                    style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-small)' }}
                  >
                    {project.name}
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

function ProjectItem({
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
              {isFetching ? '...' : '\u21BB'}
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
