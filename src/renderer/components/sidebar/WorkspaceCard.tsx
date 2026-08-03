import React, { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem, formatBranchLabel } from './AgentItem'
import { DraftAgentItem } from './DraftAgentItem'
import { InPlaceBadge } from './InPlaceBadge'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { AddFolderGlyph, FilesChevronGlyph, NewAgentGlyph, RepoGlyph } from './SidebarCardActionGlyphs'
import { projectFolderKey, useFolderDisclosure, worktreeFolderKey } from './folder-disclosure'
import { dedupeSessionsByWorktree } from '../../hooks/agent-session/agent-siblings'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceCardProps {
  workspace: Workspace
  projects: Project[]
  isActive: boolean
  sessions: AgentSession[]
  activeSessionId?: string | null
  activeProjectId?: string | null
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (e: React.MouseEvent, id: string) => void
  removing: boolean
  onNewAgent: (projectId?: string, workspaceId?: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
  onRenameAgent?: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** One workspace: the folders it spans, then the worktrees working across them.
 *
 *  Worktrees are children of the workspace, not of any one folder — a worktree
 *  checks out every folder on the same branch, so nesting it under a single repo
 *  would misrepresent its reach. */
export function WorkspaceCard({
  workspace,
  projects,
  isActive,
  sessions,
  activeSessionId,
  activeProjectId,
  outputtingSessionIds,
  drafts,
  activeDraftId,
  onSelectWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  removing,
  onNewAgent,
  onSelectSession,
  onSelectRepo,
  onAddProject,
  onRemoveProject,
  onDeleteAgent,
  onRenameAgent,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: WorkspaceCardProps): React.JSX.Element {
  const folders = useFolderDisclosure()
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

  const homeProjectId = isActive && activeProjectId && workspace.projectIds.includes(activeProjectId)
    ? activeProjectId
    : workspace.projectIds[0]

  const worktrees = dedupeSessionsByWorktree(sessions)
  const activeWorktreePath = sessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null

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
            ref={(el) => { el?.focus(); el?.select() }}
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
            <span className="truncate" style={{ minWidth: 0 }}>{workspace.name}</span>
          </span>
        )}
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
          {homeProjectId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNewAgent(homeProjectId, workspace.id) }}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.addButton}
              aria-label={`Add agent to ${workspace.name}`}
              title="New agent"
            >
              <NewAgentGlyph />
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
        // A live in-place agent has this folder's checkout on its branch, so its
        // edits land here rather than under a worktree row of its own. Say so on
        // the folder, where a reader would otherwise have no way to tell.
        const inPlace = sessions.find((s) => (
          s.projectId === pid
          && s.noWorktree
          && (s.status === 'running' || s.status === 'waiting')
        ))
        const inPlaceBranch = inPlace ? formatBranchLabel(inPlace.branchName, repo?.path ?? '') : null
        // Like an agent row: the row picks the workspace's home folder and opens
        // its files, the chevron opens them without moving home.
        const selectAndDisclose = (): void => { onSelectRepo?.(workspace.id, pid); toggleFiles() }
        return (
          <Fragment key={`repo-${pid}`}>
            <div
              className={`sidebar-item-row sidebar-repo-row${isActive && activeProjectId === pid ? ' sidebar-item-row--active' : ''}`}
              style={{ ...sidebarStyles.item, paddingLeft: 16 }}
              title={repo?.path ?? pid}
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
                {inPlaceBranch && (
                  <InPlaceBadge
                    label={inPlaceBranch}
                    description={`An agent works in this folder directly, on ${inPlaceBranch}`}
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
                {renderFolderFiles({ kind: 'project', id: pid })}
              </div>
            )}
          </Fragment>
        )
      })}

      {worktrees.map((session) => {
        const repo = projectById(session.projectId)
        const siblingOutputting = sessions.some(
          (s) => s.worktreePath === session.worktreePath && outputtingSessionIds?.has(s.id),
        )
        // An in-place agent works in a folder's own checkout, which that folder's
        // row already opens — it has no second folder of its own.
        const hasOwnWorktree = session.worktreePath !== '' && session.worktreePath !== repo?.path
        const worktreeOpen = hasOwnWorktree && folders.isOpen(worktreeFolderKey(session.id))
        return (
          <Fragment key={session.id}>
            <AgentItem
              session={session}
              projectPath={repo?.path ?? ''}
              isActive={session.worktreePath !== '' && session.worktreePath === activeWorktreePath}
              isOutputting={siblingOutputting}
              isFilesExpanded={worktreeOpen}
              onToggleFiles={hasOwnWorktree
                ? () => folders.toggle(worktreeFolderKey(session.id))
                : undefined}
              onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
              onDelete={() => onDeleteAgent?.(session, repo?.path ?? '')}
              onRename={(settings) => onRenameAgent?.(session.id, settings)}
              hideAdditionalDirs
            />
            {worktreeOpen && renderFolderFiles && (
              <div className="sidebar-project-files sidebar-project-files--worktree" style={sidebarStyles.worktreeFiles}>
                {renderFolderFiles({ kind: 'session', id: session.id })}
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
