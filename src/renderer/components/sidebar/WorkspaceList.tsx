import React, { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { AddFolderGlyph, FilesChevronGlyph, NewAgentGlyph, RepoGlyph } from './SidebarCardActionGlyphs'
import { projectFolderKey, useFolderDisclosure, worktreeFolderKey } from './folder-disclosure'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  activeWorkspaceId: string | null
  activeProjectId?: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  activeSessionId?: string | null
  outputtingSessionIds?: Set<string>
  onSelectWorkspace: (id: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onNewWorkspace?: () => void
  onNewAgent: (projectId?: string, workspaceId?: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
  onRenameAgent?: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  /** Renders a folder's file tree under its row while it is open. A workspace is
   *  a set of folders, so its repos disclose their files exactly like the
   *  standalone ones — same control, same remembered state. */
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

export function WorkspaceList({
  workspaces,
  projects,
  activeWorkspaceId,
  activeProjectId,
  sessionsByWorkspace,
  activeSessionId,
  outputtingSessionIds,
  onSelectWorkspace,
  onRemoveWorkspace,
  onNewWorkspace,
  onNewAgent,
  onSelectSession,
  onSelectRepo,
  onAddProject,
  onRemoveProject,
  onDeleteAgent,
  onRenameAgent,
  renderFolderFiles,
}: WorkspaceListProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const folders = useFolderDisclosure()

  const projectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  )

  const handleRemove = useCallback(
    async (e: React.MouseEvent, id: string): Promise<void> => {
      e.stopPropagation()
      setRemoving(id)
      try {
        await onRemoveWorkspace(id)
      } finally {
        setRemoving((c) => (c === id ? null : c))
      }
    },
    [onRemoveWorkspace],
  )

  return (
    <div style={{ paddingTop: 4 }}>
      {workspaces.map((w) => {
        const isActive = w.id === activeWorkspaceId
        const sessions = sessionsByWorkspace[w.id] ?? []
        const homeProjectId = isActive && activeProjectId && w.projectIds.includes(activeProjectId)
          ? activeProjectId
          : w.projectIds[0]

        const sessionsByProject = new Map<string, AgentSession[]>()
        for (const session of sessions) {
          const list = sessionsByProject.get(session.projectId)
          if (list) list.push(session)
          else sessionsByProject.set(session.projectId, [session])
        }
        const orphanSessions = sessions.filter((s) => !w.projectIds.includes(s.projectId))

        const renderAgent = (session: AgentSession) => {
          const project = projectById(session.projectId)
          // An in-place agent works in the repo's own checkout, which the repo
          // row already opens — it has no second folder of its own.
          const hasOwnWorktree = session.worktreePath !== '' && session.worktreePath !== project?.path
          const worktreeOpen = hasOwnWorktree && folders.isOpen(worktreeFolderKey(session.id))
          return (
            <>
              <AgentItem
                session={session}
                projectPath={project?.path ?? ''}
                isActive={isActive && session.id === activeSessionId}
                isOutputting={outputtingSessionIds?.has(session.id) ?? false}
                isFilesExpanded={worktreeOpen}
                onToggleFiles={hasOwnWorktree
                  ? () => folders.toggle(worktreeFolderKey(session.id))
                  : undefined}
                onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
                onDelete={() => onDeleteAgent?.(session, project?.path ?? '')}
                onRename={(settings) => onRenameAgent?.(session.id, settings)}
                hideAdditionalDirs
              />
              {worktreeOpen && renderFolderFiles && (
                <div className="sidebar-project-files sidebar-project-files--worktree" style={sidebarStyles.workspaceWorktreeFiles}>
                  {renderFolderFiles({ kind: 'session', id: session.id })}
                </div>
              )}
            </>
          )
        }

        return (
          <div key={w.id} className={`sidebar-project-group sidebar-project-group--has-agents sidebar-workspace-card${isActive ? ' sidebar-project-group--active' : ''}`}>
            <div
              onClick={() => onSelectWorkspace(w.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectWorkspace(w.id)
                }
              }}
              role="button"
              tabIndex={0}
              className={`sidebar-item-row sidebar-project-row${isActive ? ' sidebar-item-row--active' : ''}`}
              style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : undefined) }}
              title={w.name}
            >
              <WorkspaceGlyph active={isActive} />
              <span className="sidebar-row-label" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                <span className="truncate" style={{ minWidth: 0 }}>{w.name}</span>
              </span>
              <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                {homeProjectId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onNewAgent(homeProjectId, w.id) }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="sidebar-icon-button"
                    style={sidebarStyles.addButton}
                    aria-label={`Add agent to ${w.name}`}
                    title="New agent"
                  >
                    <NewAgentGlyph />
                  </button>
                )}
                {onAddProject && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void onAddProject(w.id) }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="sidebar-icon-button"
                    style={sidebarStyles.addButton}
                    aria-label={`Add folder to ${w.name}`}
                    title="Add folder"
                  >
                    <AddFolderGlyph />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    void handleRemove(e, w.id)
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  disabled={removing === w.id}
                  className="sidebar-icon-button"
                  style={sidebarStyles.removeButton}
                  aria-label={`Remove ${w.name}`}
                  title="Remove workspace"
                >
                  &times;
                </button>
              </div>
            </div>
            {w.projectIds.map((pid) => {
              const repo = projectById(pid)
              const repoName = repo?.name ?? pid
              const repoSessions = sessionsByProject.get(pid) ?? []
              const filesOpen = folders.isOpen(projectFolderKey(pid))
              const toggleFiles = (): void => folders.toggle(projectFolderKey(pid))
              // Like an agent row: the row picks the workspace's home repo and
              // opens its files, the chevron opens them without moving home.
              const selectAndDisclose = (): void => { onSelectRepo?.(w.id, pid); toggleFiles() }
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
                      title="Repository files"
                    >
                      <FilesChevronGlyph expanded={filesOpen} />
                    </button>
                    <span style={sidebarStyles.rowGlyph}><RepoGlyph /></span>
                    <span className="truncate">{repoName}</span>
                  </span>
                  <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                    {onRemoveProject && w.projectIds.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveProject(w.id, pid) }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="sidebar-icon-button"
                        style={sidebarStyles.removeButton}
                        aria-label={`Remove ${repoName} from workspace`}
                        title="Remove repository from workspace"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
                {filesOpen && renderFolderFiles && (
                  <div className="sidebar-project-files" style={sidebarStyles.workspaceProjectFiles}>
                    {renderFolderFiles({ kind: 'project', id: pid })}
                  </div>
                )}
                {repoSessions.map((session) => (
                  <Fragment key={session.id}>{renderAgent(session)}</Fragment>
                ))}
                </Fragment>
              )
            })}
            {orphanSessions.map((session) => (
              <Fragment key={session.id}>{renderAgent(session)}</Fragment>
            ))}
          </div>
        )
      })}
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
