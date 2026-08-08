import React, { useCallback, useEffect, useState } from 'react'
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
  behindCounts?: Record<string, number>
  onProjectFetched?: (projectId: string) => void
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
  behindCounts,
  onProjectFetched,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: WorkspaceListProps): React.JSX.Element {
  const [removing, setRemoving] = useState<string | null>(null)
  // One workspace open at a time: the list reads as a column of names until you
  // open one, and opening another closes the one before it.
  const [expandedId, setExpandedId] = useState<string | null>(activeWorkspaceId)
  const { recency, touchProject } = useProjectRecency()

  // The visit is recorded from the workspace that ended up active, not from the
  // click that asked for it: opening a folder inside another workspace, or a
  // session restored at launch, moves you just as a click on the row does, and
  // all of them have to leave the same trail for "the one I just left" to be
  // the row under the one you are in.
  useEffect(() => {
    if (activeWorkspaceId) touchProject(activeWorkspaceId)
  }, [activeWorkspaceId, touchProject])

  const toggleExpanded = useCallback(
    (id: string): void => setExpandedId((current) => (current === id ? null : id)),
    [],
  )

  const handleRemove = useCallback(
    (id: string): void => {
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
      {sortByRecency(workspaces, recency, activeWorkspaceId).map((workspace) => (
        <WorkspaceCard
          key={workspace.id}
          workspace={workspace}
          projects={projects}
          isActive={workspace.id === activeWorkspaceId}
          expanded={workspace.id === expandedId}
          onToggleExpanded={() => toggleExpanded(workspace.id)}
          sessions={sessionsByWorkspace[workspace.id] ?? []}
          activeProjectId={activeProjectId}
          outputtingSessionIds={outputtingSessionIds}
          drafts={drafts.filter((d) => workspace.projectIds.includes(d.projectId))}
          activeDraftId={activeDraftId}
          onSelectWorkspace={onSelectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onRemoveWorkspace={handleRemove}
          removing={removing === workspace.id}
          onCopyWorkspace={onCopyWorkspace}
          onSelectRepo={onSelectRepo}
          onAddProject={onAddProject}
          onRemoveProject={onRemoveProject}
          behindCounts={behindCounts}
          onProjectFetched={onProjectFetched}
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
