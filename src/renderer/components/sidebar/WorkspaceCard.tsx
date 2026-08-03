import React, { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { formatBranch, formatBranchLabel } from './agent-labels'
import { DraftAgentItem } from './DraftAgentItem'
import { InPlaceBadge } from './InPlaceBadge'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { AddFolderGlyph, CopyWorkspaceGlyph, FilesChevronGlyph, RepoGlyph } from './SidebarCardActionGlyphs'
import { projectFolderKey, useFolderDisclosure } from './folder-disclosure'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceCardProps {
  workspace: Workspace
  projects: Project[]
  isActive: boolean
  sessions: AgentSession[]
  /** projectId -> the branch that folder has checked out (home workspaces only). */
  folderBranches?: Record<string, string>
  activeProjectId?: string | null
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (e: React.MouseEvent, id: string) => void
  removing: boolean
  onCopyWorkspace?: (id: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** One workspace: the folders it spans. The agents working here are not rows —
 *  they are the tabs of the main view's Agent panel, shown when this card is
 *  clicked. The card only says *where* work happens (its folders and branch)
 *  and whether anyone is working (the pulsing dot by the name); *who* is
 *  working lives with the work itself. */
export function WorkspaceCard({
  workspace,
  projects,
  isActive,
  sessions,
  folderBranches,
  activeProjectId,
  outputtingSessionIds,
  drafts,
  activeDraftId,
  onSelectWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  removing,
  onCopyWorkspace,
  onSelectRepo,
  onAddProject,
  onRemoveProject,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: WorkspaceCardProps): React.JSX.Element {
  const folders = useFolderDisclosure()
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

  // The branch belongs to the workspace, so it is named once here rather than on
  // every agent that happens to be working on it.
  const branchLabel = workspace.branchName ? formatBranch(workspace.branchName) : null

  // With no agent rows, the card still has to say "someone is working here" —
  // a pulsing dot by the name, the same signal the rows used to carry.
  const isWorking = sessions.some((s) => outputtingSessionIds?.has(s.id))

  return (
    <div className={`sidebar-project-group sidebar-project-group--has-agents sidebar-workspace-card${isActive ? ' sidebar-project-group--active' : ''}`}>
      <div
        onClick={() => onSelectWorkspace(workspace.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectWorkspace(workspace.id)
          }
        }}
        role="button"
        tabIndex={0}
        className={`sidebar-item-row sidebar-project-row${isActive ? ' sidebar-item-row--active' : ''}`}
        style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : undefined) }}
        title={workspace.name}
      >
        <WorkspaceGlyph active={isActive} />
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
            style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}
            onDoubleClick={(e) => { e.stopPropagation(); if (onRenameWorkspace) setNameDraft(workspace.name) }}
            title={onRenameWorkspace ? 'Double-click to rename' : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="truncate" style={{ minWidth: 0 }}>{workspace.name}</span>
              {isWorking && (
                <span
                  className="status-dot status-dot--active"
                  role="status"
                  aria-label="An agent is working in this workspace"
                  title="An agent is working in this workspace"
                />
              )}
            </span>
            {branchLabel && (
              <span
                className="truncate"
                style={{ minWidth: 0, color: 'var(--text-tertiary)', fontSize: 'var(--type-ui-micro)' }}
                title={`Every folder here is checked out on ${workspace.branchName}`}
              >
                {branchLabel}
              </span>
            )}
          </span>
        )}
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
          {onCopyWorkspace && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCopyWorkspace(workspace.id) }}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.addButton}
              aria-label={`Copy ${workspace.name} to a new worktree`}
              title="Copy to new worktree — a new workspace with these folders on a fresh branch"
            >
              <CopyWorkspaceGlyph />
            </button>
          )}
          {onAddProject && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void onAddProject(workspace.id) }}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.addButton}
              aria-label={`Add folder to ${workspace.name}`}
              title="Add folder"
            >
              <AddFolderGlyph />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => onRemoveWorkspace(e, workspace.id)}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={removing}
            className="sidebar-icon-button"
            style={sidebarStyles.removeButton}
            aria-label={`Remove ${workspace.name}`}
            title="Remove workspace"
          >
            &times;
          </button>
        </div>
      </div>

      {workspace.projectIds.map((pid) => {
        const repo = projectById(pid)
        const repoName = repo?.name ?? pid
        const filesOpen = folders.isOpen(projectFolderKey(pid))
        const toggleFiles = (): void => folders.toggle(projectFolderKey(pid))
        // In a worktree workspace this row is the workspace's own checkout of the
        // repo, not the clone — that is where its agents' edits land.
        const folderPath = workspace.worktreePaths?.[pid] ?? repo?.path ?? pid
        // A home workspace is the clones themselves, so each folder sits on its
        // own branch; a worktree workspace puts them all on one, named on the
        // card above. The label says what the folder has out — no agent owns it.
        const folderBranch = branchLabel ? null : folderBranches?.[pid] ?? null
        // Like an agent row: the row picks the workspace's home folder and opens
        // its files, the chevron opens them without moving home.
        const selectAndDisclose = (): void => { onSelectRepo?.(workspace.id, pid); toggleFiles() }
        return (
          <Fragment key={`repo-${pid}`}>
            <div
              className={`sidebar-item-row sidebar-repo-row${isActive && activeProjectId === pid ? ' sidebar-item-row--active' : ''}`}
              style={{ ...sidebarStyles.item, paddingLeft: 16 }}
              title={folderPath}
              role="button"
              tabIndex={0}
              aria-expanded={filesOpen}
              onClick={selectAndDisclose}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAndDisclose() } }}
            >
              <span
                className="truncate sidebar-row-label"
                style={{ ...sidebarStyles.itemName, color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFiles() }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="sidebar-files-toggle"
                  aria-expanded={filesOpen}
                  aria-label={`${filesOpen ? 'Hide' : 'Show'} files in ${repoName}`}
                  title="Folder files"
                >
                  <FilesChevronGlyph expanded={filesOpen} />
                </button>
                <span style={sidebarStyles.rowGlyph}><RepoGlyph /></span>
                <span className="truncate">{repoName}</span>
                {folderBranch && (
                  <InPlaceBadge
                    label={formatBranch(folderBranch)}
                    description={`${repoName} is checked out on ${folderBranch}`}
                  />
                )}
              </span>
              <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                {onRemoveProject && workspace.projectIds.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveProject(workspace.id, pid) }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="sidebar-icon-button"
                    style={sidebarStyles.removeButton}
                    aria-label={`Remove ${repoName} from workspace`}
                    title="Remove folder from workspace"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            {filesOpen && renderFolderFiles && (
              <div className="sidebar-project-files" style={sidebarStyles.projectFiles}>
                {renderFolderFiles({ kind: 'project', id: pid, workspaceId: workspace.id })}
              </div>
            )}
          </Fragment>
        )
      })}

      {drafts.map((draft) => (
        <DraftAgentItem
          key={draft.id}
          draft={draft}
          isActive={draft.id === activeDraftId}
          onSelect={onSelectDraft}
          onDiscard={onDiscardDraft}
        />
      ))}
    </div>
  )
}
