import React, { useCallback, useContext, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { workspaceGlyphKind, type Workspace } from '../../../shared/workspace-types'
import { Tooltip } from '../common/Tooltip'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { useContextMenu } from '../../hooks/useContextMenu'
import { WorkspaceCardMenu } from './WorkspaceCardMenu'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { FilesChevronGlyph, WorkspaceActionsGlyph } from './SidebarCardActionGlyphs'
import { useFolderDisclosure } from './folder-disclosure'
import { rowStatus, workspaceRowLabel, type RowStatus } from './agent-labels'
import { WorkspaceRowLabel } from './WorkspaceRowLabel'
import { WorkspaceCardChildren } from './WorkspaceCardChildren'
import { WorkspaceNameInput } from './WorkspaceNameInput'
import { RepoFetchButton } from './RepoFetchButton'
import { GitSyncFailureDialog } from '../git/GitSyncFailureDialog'
import { useFetchProject } from '../../hooks/project/useFetchProject'
import { isGitProject } from '../../../shared/project-kind'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceCardProps {
  workspace: Workspace
  projects: Project[]
  isActive: boolean
  /** Whether this card shows its folders and drafts — and, on a home card, the
   *  worktree workspaces under its repo. Read from the persisted fold store by
   *  the group that renders it. */
  expanded: boolean
  onToggleExpanded: () => void
  /** A worktree card under its repo's home card: indented, guide line, repo
   *  prefix dropped since the parent said it. */
  nested?: boolean
  /** Shown on a collapsed home card: how many branches hang under it and which
   *  agent states are present among them. */
  summary?: { count: number; statuses: RowStatus[] }
  /** Replaces the displayed name without touching the stored one. The clone
   *  card uses it to read as the branch it sits on, since the repo's own name
   *  is already said by the group header above it. Rename still edits the
   *  real name. */
  labelOverride?: string
  sessions: AgentSession[]
  activeProjectId?: string | null
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  /** Takes no event: the context menu calls it too, and a menu item has none. */
  onRemoveWorkspace: (id: string) => void
  onCopyWorkspace?: (id: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  /** How far each repo's base branch trails origin, by project id. */
  behindCounts?: Record<string, number>
  onProjectFetched?: (projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** One workspace: the folders it spans. The agents working here are not rows —
 *  they are the tabs of the main view's Agent panel, shown when this card is
 *  clicked. The card only says *where* work happens (its folders) and whether
 *  anyone is working (the pulsing dot by the name); *who* is working lives
 *  with the work itself. Branch lives in Source Control, not here. */
export function WorkspaceCard({
  workspace,
  projects,
  isActive,
  expanded,
  onToggleExpanded,
  nested = false,
  summary,
  labelOverride,
  sessions,
  activeProjectId,
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
}: WorkspaceCardProps): React.JSX.Element {
  const folders = useFolderDisclosure()
  const menu = useContextMenu()
  // Favorites hang off the dock state, like the rest of the sidebar's cross-cutting
  // actions, so the card needs no props threaded down for them.
  const dock = useContext(DockStateContext)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const projectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  )

  const commitRename = useCallback((): void => {
    const next = nameDraft?.trim()
    if (next && next !== workspace.name) onRenameWorkspace?.(workspace.id, next)
    setNameDraft(null)
  }, [nameDraft, onRenameWorkspace, workspace.id, workspace.name])

  // Which repo this workspace belongs to, said on the row itself: the name
  // alone can't, since only some names carry their branch prefix.
  const label = workspaceRowLabel(workspace, projects)

  // A workspace spanning one repo renders **no folder row** (that row could
  // only repeat the repo's name): this card's disclosure opens the files
  // directly, and the row absorbs the fetch pill and Copy Path. Multi-repo
  // cards keep their folder rows, where the names differ and say something.
  const soloProjectId = workspace.projectIds.length === 1 ? workspace.projectIds[0] : null
  const soloRepo = soloProjectId ? projectById(soloProjectId) : undefined
  const soloPath = soloProjectId ? workspace.worktreePaths?.[soloProjectId] ?? soloRepo?.path : undefined
  // What the row reads as. Accessible names follow it, not the stored name, so
  // a clone row showing "main" never announces "manifold".
  const displayLabel = labelOverride ? { ...label, name: labelOverride } : label
  // Owned here: the pill sits in the hover cluster, its outcome under the row.
  const soloFetch = useFetchProject(soloProjectId ?? '', onProjectFetched)
  const showSoloFetch = Boolean(soloProjectId && soloRepo && isGitProject(soloRepo))

  // With no agent rows, the card still has to say "someone is working here" —
  // a pulsing dot by the name, plus a highlight sweeping the name itself, so the
  // signal carries even when the eye is not on the dot.
  const isWorking = sessions.some((s) => outputtingSessionIds?.has(s.id))

  // The row opens the workspace it names; the chevron alone can close it again,
  // so selecting the workspace never hides what is under it.
  const selectAndExpand = (): void => {
    onSelectWorkspace(workspace.id)
    if (!expanded) onToggleExpanded()
  }

  // The `+` opens the same menu right-click does, but hung under the button
  // rather than at the cursor, so it reads as belonging to the control.
  const openActionsMenu = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    menu.openAt({ x: r.left, y: r.bottom + 4 })
  }

  return (
    <div className={`sidebar-project-group sidebar-project-group--has-agents sidebar-workspace-card${nested ? ' sidebar-workspace-card--nested' : ''}${isActive ? ' sidebar-project-group--active' : ''}`}>
      <div
        onClick={selectAndExpand}
        onContextMenu={menu.open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            selectAndExpand()
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={`sidebar-item-row sidebar-project-row${nested ? ' sidebar-item-row--nested' : ''}${isActive ? ' sidebar-item-row--active' : ''}`}
        style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : undefined) }}
        title={displayLabel.repo ? `${displayLabel.repo}/${displayLabel.name}` : displayLabel.name}
      >
        {/* The workspace's glyph is also its disclosure: it turns into the
            chevron for its state while the row is hovered or focused, so the row
            keeps one icon column instead of a chevron beside a glyph. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExpanded() }}
          onKeyDown={(e) => e.stopPropagation()}
          className="sidebar-workspace-toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${displayLabel.name}`}
          title={expanded ? 'Collapse workspace' : 'Expand workspace'}
        >
          <span className="sidebar-workspace-toggle__glyph">
            <WorkspaceGlyph active={isActive} kind={workspaceGlyphKind(workspace)} />
          </span>
          <span className="sidebar-workspace-toggle__chevron">
            <FilesChevronGlyph expanded={expanded} />
          </span>
        </button>
        {nameDraft !== null ? (
          <WorkspaceNameInput
            value={nameDraft}
            onChange={setNameDraft}
            onCommit={commitRename}
            onCancel={() => setNameDraft(null)}
          />
        ) : (
          <WorkspaceRowLabel
            label={displayLabel}
            showRepo={!nested}
            status={rowStatus(sessions)}
            sweeping={isWorking}
            onDoubleClick={(e) => { e.stopPropagation(); if (onRenameWorkspace) setNameDraft(label.name) }}
            title={onRenameWorkspace ? 'Double-click to rename' : undefined}
          />
        )}
        {summary && !expanded && summary.count > 0 && (
          <span className="sidebar-group-summary" aria-hidden="true">
            <span className="sidebar-group-count">{summary.count}</span>
            {summary.statuses.map((s) => <span key={s} className={`status-dot status-dot--${s} status-dot--small`} />)}
          </span>
        )}
        {/* One control, not a cluster. The `×` that used to sit here is now
            "Remove Workspace" in this menu — a destructive action reads better
            as a word among its siblings than as a glyph a stray click can hit. */}
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
          {showSoloFetch && soloRepo && (
            <RepoFetchButton
              repoName={soloRepo.name}
              baseBranch={soloRepo.baseBranch}
              behindCount={soloProjectId ? behindCounts?.[soloProjectId] ?? 0 : 0}
              isFetching={soloFetch.isFetching}
              onFetch={() => { void soloFetch.fetchProject() }}
            />
          )}
          <Tooltip
            label="Workspace actions"
            detail="New workspace, add a folder, rename, remove — or right-click the row."
          >
            <button
              type="button"
              onClick={openActionsMenu}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.rowMenuButton}
              aria-haspopup="menu"
              aria-expanded={menu.position !== null}
              aria-label={`Actions for ${displayLabel.name}`}
            >
              <WorkspaceActionsGlyph />
            </button>
          </Tooltip>
        </div>
      </div>

      {showSoloFetch && soloRepo && soloFetch.error && (
        <GitSyncFailureDialog
          repoName={soloRepo.name}
          failure={{ failedCommand: 'fetch', message: soloFetch.error }}
          onClose={soloFetch.dismissError}
        />
      )}
      {showSoloFetch && soloFetch.result && (
        <div style={sidebarStyles.fetchMessage}>
          {soloFetch.result.commitCount > 0
            ? `Updated ${soloFetch.result.updatedBranch}: ${soloFetch.result.commitCount} new commit${soloFetch.result.commitCount === 1 ? '' : 's'}`
            : `${soloFetch.result.updatedBranch} is up to date`}
        </div>
      )}

      {expanded && (
        <WorkspaceCardChildren
          workspace={workspace}
          soloProjectId={soloProjectId}
          projectById={projectById}
          isActive={isActive}
          activeProjectId={activeProjectId}
          behindCounts={behindCounts}
          folders={folders}
          drafts={drafts}
          activeDraftId={activeDraftId}
          onSelectRepo={onSelectRepo}
          onRemoveProject={onRemoveProject}
          onProjectFetched={onProjectFetched}
          onSelectDraft={onSelectDraft}
          onDiscardDraft={onDiscardDraft}
          renderFolderFiles={renderFolderFiles}
        />
      )}

      {/* Not gated on `dock`: the `+` button opens this menu, and a button that
          silently does nothing wherever the dock state is absent would be worse
          than the glyphs it replaced. Favoriting drops out instead. */}
      {menu.position && (
        <WorkspaceCardMenu
          position={menu.position}
          workspaceId={workspace.id}
          renameSeed={label.name}
          isFavorite={dock?.isFavorite(workspace.id)}
          onToggleFavorite={dock ? () => dock.onToggleFavorite(workspace.id) : undefined}
          onRename={onRenameWorkspace ? (seed) => setNameDraft(seed) : undefined}
          onCopyToWorktree={onCopyWorkspace ? () => onCopyWorkspace(workspace.id) : undefined}
          onAddFolder={onAddProject ? () => void onAddProject(workspace.id) : undefined}
          onRemoveWorkspace={() => onRemoveWorkspace(workspace.id)}
          soloPath={soloPath}
          isSoloRepo={soloProjectId !== null}
          onClose={menu.close}
        />
      )}
    </div>
  )
}
