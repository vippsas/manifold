import React, { useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { FavoritesList } from './FavoritesList'
import { WorkingNowList } from './WorkingNowList'
import { CollapseAllGlyph, SearchGlyph, SortModeGlyph } from './SidebarCardActionGlyphs'
import { SidebarFilterField } from './SidebarFilterField'
import { useSidebarSortMode } from './sidebar-sort'
import { useProjectRecency } from './sidebar-recency'
import { useWorkspaceFolds } from './sidebar-fold-state'
import { useMergedWorkspaces } from '../../hooks/project/useMergedWorkspaces'
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
  const [sortMode, toggleSortMode] = useSidebarSortMode()
  // Hoisted out of the list: the recency clock orders the groups *and* (Task 8)
  // the Working-now section, and the merged set is one IPC answer for the whole
  // sidebar rather than one per card.
  const { recency, touchProject } = useProjectRecency()
  const [filter, setFilter] = useState<string | null>(null)
  const filtering = (filter ?? '').trim() !== ''
  const mergedIds = useMergedWorkspaces(workspaces, sessionsByWorkspace ?? {})
  // Shares one module-level set with the copy inside WorkspaceList, so
  // collapsing from the toolbar lands on the same folds the tree reads.
  const folds = useWorkspaceFolds()
  // Says the state *and* what the click does, so the mode is readable without
  // clicking. Not aria-pressed: this is a two-state mode, not an on/off.
  const sortLabel = sortMode === 'alpha'
    ? 'Sorted A–Z — click to sort by recently used'
    : 'Sorted by recently used — click to sort A–Z'

  return (
    <div style={sidebarStyles.root}>
      <div role="toolbar" aria-label="Workspace list actions" style={sidebarStyles.actionToolbar}>
        <span style={sidebarStyles.toolbarLabel}>Workspaces</span>
        <div style={sidebarStyles.toolbarActions}>
          <button
            type="button"
            onClick={() => setFilter((f) => (f === null ? '' : null))}
            className="sidebar-toolbar-button"
            style={sidebarStyles.toolbarButton}
            aria-label="Filter workspaces"
            aria-pressed={filter !== null}
            title="Filter workspaces"
          >
            <SearchGlyph />
          </button>
          <button
            type="button"
            onClick={toggleSortMode}
            className="sidebar-toolbar-button"
            style={sidebarStyles.toolbarButton}
            aria-label={sortLabel}
            title={sortLabel}
          >
            <SortModeGlyph mode={sortMode} />
          </button>
          <button
            type="button"
            onClick={folds.collapseAllGroups}
            className="sidebar-toolbar-button"
            style={sidebarStyles.toolbarButton}
            aria-label="Collapse all repositories"
            title="Collapse all repositories"
          >
            <CollapseAllGlyph />
          </button>
        </div>
      </div>
      {filter !== null && (
        <SidebarFilterField value={filter} onChange={setFilter} onClose={() => setFilter(null)} />
      )}
      <div style={sidebarStyles.content}>
        {!filtering && <FavoritesList />}
        {!filtering && (
          <WorkingNowList
            workspaces={workspaces}
            projects={projects}
            sessionsByWorkspace={sessionsByWorkspace ?? {}}
            recency={recency}
            onSelectWorkspace={onSelectWorkspace}
          />
        )}
        <WorkspaceList
          workspaces={workspaces}
          projects={projects}
          sortMode={sortMode}
          recency={recency}
          touchProject={touchProject}
          mergedIds={mergedIds}
          filter={filter ?? ''}
          activeWorkspaceId={activeWorkspaceId ?? null}
          activeProjectId={activeProjectId}
          sessionsByWorkspace={sessionsByWorkspace ?? {}}
          outputtingSessionIds={outputtingSessionIds}
          drafts={drafts}
          activeDraftId={activeDraftId}
          onSelectWorkspace={onSelectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
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
      <div style={sidebarStyles.actions}>
        <button
          type="button"
          onClick={onNewProject}
          className="sidebar-new-repo-button"
          style={sidebarStyles.newRepoButton}
          aria-label="New Repo"
        >
          + New Repo
        </button>
        {onNewWorkspace && (
          <button
            type="button"
            onClick={onNewWorkspace}
            className="sidebar-new-workspace-button"
            style={sidebarStyles.newWorkspaceButton}
            aria-label="New Workspace"
          >
            + New Workspace
          </button>
        )}
      </div>
    </div>
  )
}
