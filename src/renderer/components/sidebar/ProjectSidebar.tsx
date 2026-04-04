import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem, formatBranchLabel, runtimeLabel } from './AgentItem'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('360px')

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onDeleteAgent: (id: string) => Promise<void>
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
  outputtingSessionIds,
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
  const [pendingDelete, setPendingDelete] = useState<{ session: AgentSession; projectPath: string } | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  const handleRequestDeleteAgent = useCallback((session: AgentSession, projectPath: string): void => {
    setPendingDelete({ session, projectPath })
  }, [])

  const handleCancelDelete = useCallback((): void => {
    if (deletingSessionId) return
    setPendingDelete(null)
  }, [deletingSessionId])

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return

    setDeletingSessionId(pendingDelete.session.id)
    try {
      await onDeleteAgent(pendingDelete.session.id)
      setPendingDelete(null)
    } catch {
      // Keep the confirmation dialog open if deletion fails.
    } finally {
      setDeletingSessionId(null)
    }
  }, [onDeleteAgent, pendingDelete])

  return (
    <>
      <div style={sidebarStyles.root}>
        <ProjectList
          projects={projects}
          activeProjectId={activeProjectId}
          allProjectSessions={allProjectSessions}
          activeSessionId={activeSessionId}
          outputtingSessionIds={outputtingSessionIds}
          onSelectProject={onSelectProject}
          onSelectSession={onSelectSession}
          onRequestDeleteAgent={handleRequestDeleteAgent}
          onRemove={handleRemove}
          onUpdateProject={onUpdateProject}
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
      <DeleteAgentDialog
        pendingDelete={pendingDelete}
        deleting={deletingSessionId === pendingDelete?.session.id}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
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
}

function ProjectList({
  projects,
  activeProjectId,
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
}: ProjectListProps): React.JSX.Element {
  const [reposExpanded, setReposExpanded] = useState(false)

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

  // Tier 1: currently active project
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  // Tier 2: other projects that have running sessions
  const withAgentsProjects = projects.filter(
    (p) => p.id !== activeProjectId && (allProjectSessions[p.id] ?? []).length > 0
  )

  // Tier 3: projects with no sessions
  const inactiveProjects = projects.filter(
    (p) => p.id !== activeProjectId && (allProjectSessions[p.id] ?? []).length === 0
  )

  if (projects.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  return (
    <div style={sidebarStyles.list}>
      {/* Tier 1: Active project — expanded with agents */}
      {activeProject !== null && (
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
          {(allProjectSessions[activeProject.id] ?? []).map((session) => (
            <AgentItem
              key={session.id}
              session={session}
              projectPath={activeProject.path}
              isActive={session.id === activeSessionId}
              isOutputting={outputtingSessionIds.has(session.id)}
              onSelect={(sessionId) => onSelectSession(sessionId, activeProject.id)}
              onDelete={() => onRequestDeleteAgent(session, activeProject.path)}
            />
          ))}
        </div>
      )}

      {/* Tier 2: Other projects with agents — collapsed with mini status dots */}
      {withAgentsProjects.length > 0 && (
        <>
          <div style={sidebarStyles.sectionDivider} />
          <div style={sidebarStyles.sectionLabel}>With agents</div>
          {withAgentsProjects.map((project) => {
            const projectSessions = allProjectSessions[project.id] ?? []
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

interface DeleteAgentDialogProps {
  pendingDelete: { session: AgentSession; projectPath: string } | null
  deleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

function DeleteAgentDialog({
  pendingDelete,
  deleting,
  onCancel,
  onConfirm,
}: DeleteAgentDialogProps): React.JSX.Element | null {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape' && !deleting) onCancel()
    },
    [deleting, onCancel]
  )

  if (!pendingDelete) return null

  const { session, projectPath } = pendingDelete
  const label = formatBranchLabel(session.branchName, projectPath)
  const actionText = session.noWorktree
    ? 'This will stop the agent.'
    : 'This will stop the agent and remove its worktree.'

  return (
    <div
      onClick={deleting ? undefined : onCancel}
      onKeyDown={handleKeyDown}
      style={deleteDialogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Delete agent"
    >
      <div style={deleteDialogStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={deleteDialogStyles.header}>
          <span style={deleteDialogStyles.title}>Delete agent</span>
          <button
            type="button"
            onClick={onCancel}
            style={deleteDialogStyles.closeButton}
            aria-label="Close delete dialog"
            disabled={deleting}
          >
            &times;
          </button>
        </div>
        <div style={deleteDialogStyles.body}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{label}</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}>
              {runtimeLabel(session.runtimeId)}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {actionText} The local branch will be kept.
          </p>
        </div>
        <div style={deleteDialogStyles.footer}>
          <button type="button" onClick={onCancel} style={deleteDialogStyles.secondaryButton} disabled={deleting}>Cancel</button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            style={{ ...deleteDialogStyles.primaryButton, background: 'var(--error)' }}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
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
