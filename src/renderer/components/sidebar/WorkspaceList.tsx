import { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { AddFolderGlyph, NewAgentGlyph } from './SidebarCardActionGlyphs'

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
}: WorkspaceListProps) {
  const [removing, setRemoving] = useState<string | null>(null)

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
          return (
            <AgentItem
              session={session}
              projectPath={project?.path ?? ''}
              isActive={isActive && session.id === activeSessionId}
              isOutputting={outputtingSessionIds?.has(session.id) ?? false}
              onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
              onDelete={() => onDeleteAgent?.(session, project?.path ?? '')}
              onRename={(settings) => onRenameAgent?.(session.id, settings)}
              hideAdditionalDirs
            />
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
              return (
                <Fragment key={`repo-${pid}`}>
                <div
                  className={`sidebar-item-row sidebar-repo-row${isActive && activeProjectId === pid ? ' sidebar-item-row--active' : ''}`}
                  style={{ ...sidebarStyles.item, paddingLeft: 28 }}
                  title={repo?.path ?? pid}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRepo?.(w.id, pid)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRepo?.(w.id, pid) } }}
                >
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
                  >
                    {repoName}
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
