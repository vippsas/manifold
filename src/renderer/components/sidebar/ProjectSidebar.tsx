import React from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { FavoritesList } from './FavoritesList'
import { AddFolderGlyph } from './SidebarCardActionGlyphs'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  outputtingSessionIds: Set<string>
  onNewProject: () => void
  onNewWorkspace?: () => void
  workspaces: Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onCopyWorkspace?: (id: string) => void
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
  onAddProjectToWorkspace?: (workspaceId: string) => void | Promise<void>
  onRemoveProjectFromWorkspace?: (workspaceId: string, projectId: string) => void
  /** How far each repo's base branch trails origin, by project id. */
  behindCounts?: Record<string, number>
  onProjectFetched?: (projectId: string) => void
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  outputtingSessionIds,
  onNewProject,
  onNewWorkspace,
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onSelectWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onCopyWorkspace,
  onSelectWorkspaceRepo,
  onAddProjectToWorkspace,
  onRemoveProjectFromWorkspace,
  behindCounts,
  onProjectFetched,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: ProjectSidebarProps): React.JSX.Element {
  return (
    <div style={sidebarStyles.root}>
      <div role="toolbar" aria-label="Repository actions" style={sidebarStyles.actionToolbar}>
        <span style={sidebarStyles.toolbarLabel}>Workspaces</span>
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
        <WorkspaceList
          workspaces={workspaces}
          projects={projects}
          activeWorkspaceId={activeWorkspaceId ?? null}
          activeProjectId={activeProjectId}
          sessionsByWorkspace={sessionsByWorkspace ?? {}}
          outputtingSessionIds={outputtingSessionIds}
          drafts={drafts}
          activeDraftId={activeDraftId}
          onSelectWorkspace={onSelectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
          onNewWorkspace={onNewWorkspace}
          onCopyWorkspace={onCopyWorkspace}
          onSelectRepo={onSelectWorkspaceRepo}
          onAddProject={onAddProjectToWorkspace}
          onRemoveProject={onRemoveProjectFromWorkspace}
          behindCounts={behindCounts}
          onProjectFetched={onProjectFetched}
          onSelectDraft={onSelectDraft}
          onDiscardDraft={onDiscardDraft}
          renderFolderFiles={renderFolderFiles}
        />
      </div>
    </div>
  )
}
