import React, { useCallback, useContext, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { isWorktreeWorkspace, type Workspace } from '../../../shared/workspace-types'
import { ContextMenu } from '../common/ContextMenu'
import { Tooltip } from '../common/Tooltip'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { useContextMenu } from '../../hooks/useContextMenu'
import { buildWorkspaceContextMenu } from './workspace-context-menu'
import { sidebarStyles } from './ProjectSidebar.styles'
import { DraftAgentItem } from './DraftAgentItem'
import { FilesChevronGlyph, WorkspaceActionsGlyph } from './SidebarCardActionGlyphs'
import { projectFolderKey, useFolderDisclosure } from './folder-disclosure'
import { workspaceRowLabel } from './agent-labels'
import { WorkspaceRepoRow } from './WorkspaceRepoRow'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceCardProps {
  workspace: Workspace
  projects: Project[]
  isActive: boolean
  /** Whether this card shows its folders and drafts. Each workspace keeps its
   *  own state, but the sidebar owns them all so its header can collapse the
   *  lot in one click. */
  expanded: boolean
  onToggleExpanded: () => void
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
  // Stable identity so React only calls this when the input mounts — an inline
  // ref callback would re-run on every keystroke and re-select the text,
  // making the next character overwrite the whole draft.
  const focusAndSelect = useCallback((el: HTMLInputElement | null): void => {
    el?.focus()
    el?.select()
  }, [])
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

  // Everything the name can't say, dimmed and trailing it — VS Code's label
  // description. It carries what the row's glyph used to: the repo the
  // workspace belongs to, and whether it is a worktree rather than the clone.
  const description = [
    label.repo,
    isWorktreeWorkspace(workspace) ? 'worktree' : null,
  ].filter(Boolean).join(' · ')

  // Exactly one row in the sidebar wears the selection bar. While this
  // workspace is open and one of its folders is the selected one, that row is
  // the folder's — the header would otherwise paint a second bar for the same
  // selection, which is what the old whole-card wash did.
  const folderSelected = expanded
    && Boolean(activeProjectId)
    && workspace.projectIds.includes(activeProjectId!)
  const rowSelected = isActive && !folderSelected

  // With no agent rows, the card still has to say "someone is working here" —
  // a pulsing dot by the name, plus a highlight sweeping the name itself, so the
  // signal carries even when the eye is not on the dot.
  const isWorking = sessions.some((s) => outputtingSessionIds?.has(s.id))
  const sweep = isWorking ? 'sidebar-label-working' : ''

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
    <div className={`sidebar-project-group sidebar-project-group--has-agents sidebar-workspace-card${isActive ? ' sidebar-project-group--active' : ''}`}>
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
        className={`sidebar-item-row sidebar-project-row${rowSelected ? ' sidebar-item-row--active' : ''}`}
        style={{ ...sidebarStyles.item, ...(rowSelected ? sidebarStyles.itemActive : undefined) }}
        title={description ? `${label.name} — ${description}` : label.name}
      >
        {/* The chevron is always drawn, in the same 16px column the folder rows
            and the file tree below use, so one twistie column runs the height of
            the sidebar. It used to be the workspace's kind glyph, swapping to a
            chevron on hover — which hid the disclosure until the pointer was
            already on the row, and broke that column's alignment besides. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExpanded() }}
          onKeyDown={(e) => e.stopPropagation()}
          className="sidebar-workspace-toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${workspace.name}`}
          title={expanded ? 'Collapse workspace' : 'Expand workspace'}
        >
          <FilesChevronGlyph expanded={expanded} />
        </button>
        {nameDraft !== null ? (
          <input
            ref={focusAndSelect}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              else if (e.key === 'Escape') { e.preventDefault(); setNameDraft(null) }
            }}
            style={sidebarStyles.nameInput}
            aria-label="Workspace name"
          />
        ) : (
          <span
            className="sidebar-row-label"
            style={sidebarStyles.rowLabelPath}
            onDoubleClick={(e) => { e.stopPropagation(); if (onRenameWorkspace) setNameDraft(label.name) }}
            title={onRenameWorkspace ? 'Double-click to rename' : undefined}
          >
            {/* The sweep goes on each segment, never on the span wrapping them:
                one `background-clip: text` element paints everything beneath it
                from a single gradient, which flattened the dimmed segment to the
                name's contrast. Per segment, each keeps its own colour as the
                sweep's base, and `background-attachment: fixed` (theme.css) is
                what still makes the two read as one band. */}
            <span className={`truncate ${sweep}`.trim()} style={{ minWidth: 0 }}>
              {label.name}
            </span>
            {description && (
              <span className={`sidebar-row-description ${sweep}`.trim()}>{description}</span>
            )}
            {isWorking && (
              <span
                style={{ marginLeft: 6 }}
                className="status-dot status-dot--active"
                role="status"
                aria-label="An agent is working in this workspace"
                title="An agent is working in this workspace"
              />
            )}
          </span>
        )}
        {/* One control, not a cluster. The `×` that used to sit here is now
            "Remove Workspace" in this menu — a destructive action reads better
            as a word among its siblings than as a glyph a stray click can hit. */}
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
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
              aria-label={`Actions for ${workspace.name}`}
            >
              <WorkspaceActionsGlyph />
            </button>
          </Tooltip>
        </div>
      </div>

      {expanded && workspace.projectIds.map((pid) => (
        <WorkspaceRepoRow
          key={`repo-${pid}`}
          workspace={workspace}
          projectId={pid}
          repo={projectById(pid)}
          isActive={isActive && activeProjectId === pid}
          behindCount={behindCounts?.[pid]}
          filesOpen={folders.isOpen(projectFolderKey(pid))}
          onToggleFiles={() => folders.toggle(projectFolderKey(pid))}
          onSelectRepo={onSelectRepo}
          onRemoveProject={onRemoveProject}
          onFetched={onProjectFetched}
          renderFolderFiles={renderFolderFiles}
        />
      ))}

      {expanded && drafts.map((draft) => (
        <DraftAgentItem
          key={draft.id}
          draft={draft}
          isActive={draft.id === activeDraftId}
          onSelect={onSelectDraft}
          onDiscard={onDiscardDraft}
        />
      ))}

      {/* Not gated on `dock`: the `+` button opens this menu, and a button that
          silently does nothing wherever the dock state is absent would be worse
          than the glyphs it replaced. Favoriting drops out instead. */}
      {menu.position && (
        <ContextMenu
          x={menu.position.x}
          y={menu.position.y}
          items={buildWorkspaceContextMenu({
            isFavorite: dock?.isFavorite(workspace.id),
            toggleFavorite: dock ? () => dock.onToggleFavorite(workspace.id) : undefined,
            rename: onRenameWorkspace ? () => setNameDraft(label.name) : undefined,
            copyToWorktree: onCopyWorkspace ? () => onCopyWorkspace(workspace.id) : undefined,
            addFolder: onAddProject ? () => void onAddProject(workspace.id) : undefined,
            removeWorkspace: () => onRemoveWorkspace(workspace.id),
          })}
          onClose={menu.close}
        />
      )}
    </div>
  )
}
