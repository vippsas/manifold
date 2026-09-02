import React, { useCallback, useEffect } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceCard } from './WorkspaceCard'
import { useProjectRecency } from './sidebar-recency'
import { sortWorkspaces, type SidebarSortMode } from './sidebar-sort'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  /** How the list is ordered. Owned by ProjectSidebar, which renders the toggle. */
  sortMode: SidebarSortMode
  activeWorkspaceId: string | null
  activeProjectId?: string | null
  /** Which workspaces are open. Owned by ProjectSidebar, whose header carries
   *  the "Collapse All" that has to be able to empty it. */
  expandedIds: ReadonlySet<string>
  onToggleExpanded: (id: string) => void
  sessionsByWorkspace: Record<string, AgentSession[]>
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
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
  sortMode,
  activeWorkspaceId,
  activeProjectId,
  expandedIds,
  onToggleExpanded,
  sessionsByWorkspace,
  outputtingSessionIds,
  drafts,
  activeDraftId,
  onSelectWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
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
  const { recency, touchProject } = useProjectRecency()

  // The visit is recorded from the workspace that ended up active, not from the
  // click that asked for it: opening a folder inside another workspace, or a
  // session restored at launch, moves you just as a click on the row does, and
  // all of them have to leave the same trail for "the one I just left" to be
  // the row under the one you are in.
  useEffect(() => {
    if (activeWorkspaceId) touchProject(activeWorkspaceId)
  }, [activeWorkspaceId, touchProject])

  // Adapts the list's async remover to the card's void-returning prop. It no
  // longer tracks which row is in flight: that flag only ever disabled the row's
  // `×`, and removal now lives behind a menu that closes on the click.
  const handleRemove = useCallback(
    (id: string): void => { void onRemoveWorkspace(id) },
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
    <div>
      {sortWorkspaces(workspaces, sortMode, {
        recency,
        activeId: activeWorkspaceId,
        projects,
      }).map((workspace) => (
        <WorkspaceCard
          key={workspace.id}
          workspace={workspace}
          projects={projects}
          isActive={workspace.id === activeWorkspaceId}
          expanded={expandedIds.has(workspace.id)}
          onToggleExpanded={() => onToggleExpanded(workspace.id)}
          sessions={sessionsByWorkspace[workspace.id] ?? []}
          activeProjectId={activeProjectId}
          outputtingSessionIds={outputtingSessionIds}
          drafts={drafts.filter((d) => workspace.projectIds.includes(d.projectId))}
          activeDraftId={activeDraftId}
          onSelectWorkspace={onSelectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onRemoveWorkspace={handleRemove}
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
    </div>
  )
}
