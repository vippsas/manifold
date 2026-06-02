import React, { useCallback } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { SuperagentList } from './SuperagentList'
import { WorkspaceList } from './WorkspaceList'
import { ProjectList } from './ProjectList'
import type { SessionSelectionOptions } from '../../session-selection'

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
  workspaces?: Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace?: (id: string) => void
  onRemoveWorkspace?: (id: string) => Promise<void>
  onSpawnWorkspaceAgent?: (workspaceId: string) => void
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
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onSelectWorkspace,
  onRemoveWorkspace,
  onSpawnWorkspaceAgent,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
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
      {workspaces && onSelectWorkspace && onRemoveWorkspace && onSpawnWorkspaceAgent && (
        <WorkspaceList
          workspaces={workspaces}
          projects={projects}
          activeWorkspaceId={activeWorkspaceId ?? null}
          sessionsByWorkspace={sessionsByWorkspace ?? {}}
          activeSessionId={activeSessionId}
          outputtingSessionIds={outputtingSessionIds}
          onSelectWorkspace={onSelectWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
          onSelectSession={onSelectSession}
          onSpawnAgent={onSpawnWorkspaceAgent}
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
        drafts={drafts}
        activeDraftId={activeDraftId}
        onSelectDraft={onSelectDraft}
        onDiscardDraft={onDiscardDraft}
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
