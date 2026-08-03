import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceCard } from './WorkspaceCard'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { sortByRecency, useProjectRecency } from './sidebar-recency'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  activeWorkspaceId: string | null
  activeProjectId?: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  /** projectId -> the branch that folder has checked out (home workspaces only). */
  folderBranches?: Record<string, string>
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onNewWorkspace?: () => void
  onCopyWorkspace?: (id: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Renders a folder's file tree under its row while it is open. Injected by
   *  the dock panel so the sidebar stays free of editor/file plumbing. */
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** The whole Repositories sidebar. Every repo lives in a workspace — one that
 *  spans a single folder is the ordinary case, not a special one — so this is
 *  the only list of roots there is. */
export function WorkspaceList({
  workspaces,
  projects,
  activeWorkspaceId,
  activeProjectId,
  sessionsByWorkspace,
  folderBranches,
  outputtingSessionIds,
  drafts,
  activeDraftId,
  onSelectWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onNewWorkspace,
  onCopyWorkspace,
  onSelectRepo,
  onAddProject,
  onRemoveProject,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: WorkspaceListProps): React.JSX.Element {
  const [removing, setRemoving] = useState<string | null>(null)
  const { recency, touchProject } = useProjectRecency()

  const selectWorkspace = useCallback(
    (id: string): void => {
      touchProject(id)
      onSelectWorkspace(id)
    },
    [onSelectWorkspace, touchProject],
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      setRemoving(id)
      void onRemoveWorkspace(id).finally(() => {
        setRemoving((c) => (c === id ? null : c))
      })
    },
    [onRemoveWorkspace],
  )

  if (workspaces.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {sortByRecency(workspaces, recency).map((workspace) => (
        <WorkspaceCard
          key={workspace.id}
          workspace={workspace}
          projects={projects}
          isActive={workspace.id === activeWorkspaceId}
          sessions={sessionsByWorkspace[workspace.id] ?? []}
          folderBranches={folderBranches}
          activeProjectId={activeProjectId}
          outputtingSessionIds={outputtingSessionIds}
          drafts={drafts.filter((d) => workspace.projectIds.includes(d.projectId))}
          activeDraftId={activeDraftId}
          onSelectWorkspace={selectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onRemoveWorkspace={handleRemove}
          removing={removing === workspace.id}
          onCopyWorkspace={onCopyWorkspace}
          onSelectRepo={onSelectRepo}
          onAddProject={onAddProject}
          onRemoveProject={onRemoveProject}
          onSelectDraft={onSelectDraft}
          onDiscardDraft={onDiscardDraft}
          renderFolderFiles={renderFolderFiles}
        />
      ))}
      {onNewWorkspace && (
        <button
          type="button"
          onClick={onNewWorkspace}
          className="sidebar-new-workspace-button"
          style={sidebarStyles.newWorkspaceButton}
          aria-label="New Workspace"
        >
          <WorkspaceGlyph />
          <span>New workspace</span>
        </button>
      )}
    </div>
  )
}
