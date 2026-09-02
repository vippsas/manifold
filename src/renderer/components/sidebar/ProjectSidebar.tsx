import React, { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { FavoritesList } from './FavoritesList'
import {
  CollapseAllGlyph,
  NewRepoGlyph,
  NewWorkspaceGlyph,
  SortModeGlyph,
} from './SidebarCardActionGlyphs'
import { useSidebarSortMode } from './sidebar-sort'
import { useSidebarSectionState } from './sidebar-section-state'
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

/** The disclosure on the pane header itself, which folds the whole list away.
 *  Smaller than a row's twistie (10px against 16px): it turns a section, not a
 *  tree node, and VS Code draws the two at different weights for that reason. */
function PaneChevron({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : undefined,
        transition: 'transform 0.1s ease',
      }}
    >
      <path
        d="M3 1L7 5L3 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
  const [paneExpanded, togglePane] = useSidebarSectionState('workspaces', true)

  // Which workspaces are open. Every workspace keeps its own state — opening one
  // no longer closes the last — so the list holds still under a click the way
  // VS Code's multi-root explorer does. It lives here rather than in the list
  // because "Collapse All" in the header has to be able to empty it.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(activeWorkspaceId ? [activeWorkspaceId] : []),
  )

  const toggleExpanded = useCallback((id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  const collapseAll = useCallback((): void => setExpandedIds(new Set()), [])

  // Says the state *and* what the click does, so the mode is readable without
  // clicking. Not aria-pressed: this is a two-state mode, not an on/off.
  const sortLabel = sortMode === 'alpha'
    ? 'Sorted A–Z — click to sort by recently used'
    : 'Sorted by recently used — click to sort A–Z'

  return (
    <div style={sidebarStyles.root}>
      <div
        role="toolbar"
        aria-label="Workspace list actions"
        className="sidebar-pane-header"
        style={sidebarStyles.actionToolbar}
      >
        <button
          type="button"
          onClick={togglePane}
          style={sidebarStyles.toolbarLabel}
          aria-expanded={paneExpanded}
          title={paneExpanded ? 'Collapse Workspaces' : 'Expand Workspaces'}
        >
          <PaneChevron expanded={paneExpanded} />
          <span>Workspaces</span>
        </button>
        {/* Both create actions live here now, as icons that appear on hover —
            VS Code puts a pane's actions in its header, and the bottom bar they
            came from was the last thing in the sidebar still shaped like a
            dialog. The words survive as tooltips and labels. */}
        <div className="sidebar-pane-actions" style={sidebarStyles.toolbarActions}>
          <button
            type="button"
            onClick={onNewProject}
            style={sidebarStyles.toolbarButton}
            aria-label="New Repo"
            title="New Repo"
          >
            <NewRepoGlyph />
          </button>
          {onNewWorkspace && (
            <button
              type="button"
              onClick={onNewWorkspace}
              style={sidebarStyles.toolbarButton}
              aria-label="New Workspace"
              title="New Workspace"
            >
              <NewWorkspaceGlyph />
            </button>
          )}
          <button
            type="button"
            onClick={toggleSortMode}
            style={sidebarStyles.toolbarButton}
            aria-label={sortLabel}
            title={sortLabel}
          >
            <SortModeGlyph mode={sortMode} />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={sidebarStyles.toolbarButton}
            aria-label="Collapse All Workspaces"
            title="Collapse All Workspaces"
          >
            <CollapseAllGlyph />
          </button>
        </div>
      </div>
      {paneExpanded && (
        <div style={sidebarStyles.content}>
          <FavoritesList />
          <WorkspaceList
            workspaces={workspaces}
            projects={projects}
            sortMode={sortMode}
            activeWorkspaceId={activeWorkspaceId ?? null}
            activeProjectId={activeProjectId}
            expandedIds={expandedIds}
            onToggleExpanded={toggleExpanded}
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
      )}
    </div>
  )
}
