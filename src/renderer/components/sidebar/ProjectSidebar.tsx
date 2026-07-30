import React, { useCallback } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { ProjectList } from './ProjectList'
import { FavoritesList } from './FavoritesList'
import { AddFolderGlyph } from './SidebarCardActionGlyphs'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface ProjectSidebarProps {
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
  onRenameAgent: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgent: (projectId?: string, workspaceId?: string) => void
  onNewProject: () => void
  onCreateWorkspaceFromProject?: (projectId: string) => Promise<void>
  onNewWorkspace?: () => void
  workspaces?: Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace?: (id: string) => void
  onRemoveWorkspace?: (id: string) => Promise<void>
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
  onAddProjectToWorkspace?: (workspaceId: string) => void | Promise<void>
  onRemoveProjectFromWorkspace?: (workspaceId: string, projectId: string) => void
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
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
  onCreateWorkspaceFromProject,
  onNewWorkspace,
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onSelectWorkspace,
  onRemoveWorkspace,
  onSelectWorkspaceRepo,
  onAddProjectToWorkspace,
  onRemoveProjectFromWorkspace,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: ProjectSidebarProps): React.JSX.Element {
  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  const workspacesEnabled = Boolean(workspaces && onSelectWorkspace && onRemoveWorkspace)

  return (
    <div style={sidebarStyles.root}>
      <div role="toolbar" aria-label="Repository actions" style={sidebarStyles.actionToolbar}>
        {workspacesEnabled && <span style={sidebarStyles.toolbarLabel}>Workspaces</span>}
        <button
          type="button"
          onClick={onNewProject}
          className="sidebar-toolbar-button sidebar-toolbar-button--primary"
          style={{ ...sidebarStyles.toolbarButton, ...sidebarStyles.toolbarButtonPrimary }}
          aria-label="Add Repository"
          title="Add Repository"
        >
          <AddFolderGlyph />
        </button>
      </div>
      <div style={sidebarStyles.content}>
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
            onNewAgent={onNewAgent}
            onSelectSession={onSelectSession}
            onSelectRepo={onSelectWorkspaceRepo}
            activeProjectId={activeProjectId}
            onAddProject={onAddProjectToWorkspace}
            onRemoveProject={onRemoveProjectFromWorkspace}
            onDeleteAgent={onRequestDeleteAgent}
            onRenameAgent={onRenameAgent}
            renderFolderFiles={renderFolderFiles}
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
          onNewAgent={onNewAgent}
          onCreateWorkspaceFromProject={onCreateWorkspaceFromProject}
          drafts={drafts}
          activeDraftId={activeDraftId}
          onSelectDraft={onSelectDraft}
          onDiscardDraft={onDiscardDraft}
          renderFolderFiles={renderFolderFiles}
        />
      </div>
    </div>
  )
}
