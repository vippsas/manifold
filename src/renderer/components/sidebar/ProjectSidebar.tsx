import React, { useCallback } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { ProjectList } from './ProjectList'
import { FavoritesList } from './FavoritesList'
import { WorktreesSidebarButton } from './WorktreesSidebarButton'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onRenameAgent: (sessionId: string, displayName: string) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgent: () => void
  onNewProject: () => void
  onNewWorkspace?: () => void
  workspaces?: Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace?: (id: string) => void
  onRemoveWorkspace?: (id: string) => Promise<void>
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
  onAddProjectToWorkspace?: (workspaceId: string) => void
  onRemoveProjectFromWorkspace?: (workspaceId: string, projectId: string) => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
  activeProjectBehindCount?: number
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
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
  onRenameAgent,
  onRequestDeleteAgent,
  onNewAgent,
  onNewProject,
  onNewWorkspace,
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onSelectWorkspace,
  onRemoveWorkspace,
  onSelectWorkspaceRepo,
  onAddProjectToWorkspace,
  onRemoveProjectFromWorkspace,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
  activeProjectBehindCount,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
}: ProjectSidebarProps): React.JSX.Element {
  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  const activeWorkspace = activeWorkspaceId
    ? workspaces?.find((w) => w.id === activeWorkspaceId)
    : undefined

  return (
    <div style={sidebarStyles.root}>
      <WorktreesSidebarButton />
      <FavoritesList />
      {workspaces && onSelectWorkspace && onRemoveWorkspace && (
        <WorkspaceList
          workspaces={workspaces}
          projects={projects}
          activeWorkspaceId={activeWorkspaceId ?? null}
          sessionsByWorkspace={sessionsByWorkspace ?? {}}
          activeSessionId={activeSessionId}
          outputtingSessionIds={outputtingSessionIds}
          onSelectWorkspace={onSelectWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
          onNewWorkspace={onNewWorkspace}
          onSelectSession={onSelectSession}
          onSelectRepo={onSelectWorkspaceRepo}
          activeProjectId={activeProjectId}
          onAddProject={onAddProjectToWorkspace}
          onRemoveProject={onRemoveProjectFromWorkspace}
          onDeleteAgent={onRequestDeleteAgent}
          onRenameAgent={onRenameAgent}
          onFetchProject={onFetchProject}
          fetchingProjectId={fetchingProjectId}
          lastFetchedProjectId={lastFetchedProjectId}
          fetchResult={fetchResult}
          fetchError={fetchError}
        />
      )}
      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        activeWorkspaceId={activeWorkspaceId}
        suppressedProjectIds={suppressedProjectIds}
        allProjectSessions={allProjectSessions}
        activeSessionId={activeSessionId}
        outputtingSessionIds={outputtingSessionIds}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
        onRequestDeleteAgent={onRequestDeleteAgent}
        onRemove={handleRemove}
        onUpdateProject={onUpdateProject}
        onRenameAgent={onRenameAgent}
        fetchingProjectId={fetchingProjectId}
        lastFetchedProjectId={lastFetchedProjectId}
        fetchResult={fetchResult}
        fetchError={fetchError}
        onFetchProject={onFetchProject}
        activeProjectBehindCount={activeProjectBehindCount}
        onNewAgent={onNewAgent}
        drafts={drafts}
        activeDraftId={activeDraftId}
        onSelectDraft={onSelectDraft}
        onDiscardDraft={onDiscardDraft}
      />
      <div style={sidebarStyles.actions}>
        <div style={sidebarStyles.actionsRow}>
          <button
            type="button"
            onClick={onNewAgent}
            className="sidebar-action-button sidebar-action-button--primary"
            style={sidebarStyles.actionButtonPrimary}
            title={activeWorkspace ? `New Agent in ${activeWorkspace.name}` : 'New Agent'}
          >
            <span className="truncate">{activeWorkspace ? `+ New Agent in ${activeWorkspace.name}` : '+ New Agent'}</span>
          </button>
          <button type="button" onClick={onNewProject} className="sidebar-action-button" style={sidebarStyles.actionButton}>
            + New Repository
          </button>
        </div>
      </div>
    </div>
  )
}
