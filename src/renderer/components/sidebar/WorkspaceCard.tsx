import React, { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem, formatBranch, formatBranchLabel } from './AgentItem'
import { DraftAgentItem } from './DraftAgentItem'
import { InPlaceBadge } from './InPlaceBadge'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { AddFolderGlyph, FilesChevronGlyph, NewAgentGlyph, RepoGlyph } from './SidebarCardActionGlyphs'
import { projectFolderKey, useFolderDisclosure } from './folder-disclosure'
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

/** One workspace: the folders it spans, then the agents working across them.
 *
 *  The workspace *is* the checkout — one per folder, all on its branch — so the
 *  folder rows are that checkout's folders and an agent row is only an agent.
 *  Several agents in a workspace share its folders, the way several people share
 *  one desk; a second branch over the same repos is a second workspace. */
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

  // The branch belongs to the workspace, so it is named once here rather than on
  // every agent that happens to be working on it.
  const branchLabel = workspace.branchName ? formatBranch(workspace.branchName) : null

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
        // In a worktree workspace this row is the workspace's own checkout of the
        // repo, not the clone — that is where its agents' edits land.
        const folderPath = workspace.worktreePaths?.[pid] ?? repo?.path ?? pid
        // A home workspace has no checkout of its own: it is the clone, and a live
        // agent there edits it directly, on whatever branch it has out.
        const inPlace = branchLabel ? undefined : sessions.find((s) => (
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
                {renderFolderFiles({ kind: 'project', id: pid, workspaceId: workspace.id })}
              </div>
            )}
          </Fragment>
        )
      })}

      {/* Every agent gets a row of its own. They no longer stand for separate
          worktrees — the folders above are the one checkout they all work in —
          so agents sharing it must not collapse into a single row. */}
      {sessions.map((session) => (
        <AgentItem
          key={session.id}
          session={session}
          projectPath={projectById(session.projectId)?.path ?? ''}
          isActive={session.id === activeSessionId}
          isOutputting={outputtingSessionIds?.has(session.id) ?? false}
          onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
          onDelete={() => onDeleteAgent?.(session, projectById(session.projectId)?.path ?? '')}
          onRename={(settings) => onRenameAgent?.(session.id, settings)}
          hideAdditionalDirs
        />
      ))}

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
