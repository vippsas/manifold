import { Fragment, useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  activeWorkspaceId: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  activeSessionId?: string | null
  outputtingSessionIds?: Set<string>
  onSelectWorkspace: (id: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onSelectSession: (sessionId: string, projectId: string) => void
  onSpawnAgent: (workspaceId: string, homeProjectId?: string) => void
  onAddProject?: (workspaceId: string) => void
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
  onNewWorkspace?: () => void
}

export function WorkspaceList({
  workspaces,
  projects,
  activeWorkspaceId,
  sessionsByWorkspace,
  activeSessionId,
  outputtingSessionIds,
  onSelectWorkspace,
  onRemoveWorkspace,
  onSelectSession,
  onSpawnAgent,
  onAddProject,
  onRemoveProject,
  onDeleteAgent,
  onNewWorkspace,
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

  // The header (label + "New workspace" +) always renders — even with zero
  // workspaces — so it's the always-available entry point for creating the first one.
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ ...sidebarStyles.sectionLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Workspaces</span>
        {onNewWorkspace && (
          <button
            type="button"
            onClick={onNewWorkspace}
            className="sidebar-icon-button"
            style={sidebarStyles.addButton}
            aria-label="New workspace"
            title="New workspace"
          >
            +
          </button>
        )}
      </div>
      {workspaces.map((w) => {
        const isActive = w.id === activeWorkspaceId
        if (!isActive) {
          return (
            <div
              key={w.id}
              style={sidebarStyles.collapsedProject}
              onClick={() => onSelectWorkspace(w.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectWorkspace(w.id)
                }
              }}
              role="button"
              tabIndex={0}
              className="sidebar-project-group sidebar-project-group--collapsed"
              title={`${w.name} — ${w.projectIds.length} repos`}
            >
              <span
                className="truncate sidebar-row-label"
                style={{ ...sidebarStyles.item, color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
              >
                {w.name}
              </span>
            </div>
          )
        }

        const sessions = sessionsByWorkspace[w.id] ?? []

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
              isActive={session.id === activeSessionId}
              isOutputting={outputtingSessionIds?.has(session.id) ?? false}
              onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
              onDelete={() => onDeleteAgent?.(session, project?.path ?? '')}
              hideAdditionalDirs
            />
          )
        }

        return (
          <div key={w.id} className="sidebar-project-group sidebar-project-group--active">
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
              className="sidebar-item-row sidebar-project-row sidebar-item-row--active"
              style={{ ...sidebarStyles.item, ...sidebarStyles.itemActive }}
              title={w.name}
            >
              <span className="truncate sidebar-row-label" style={sidebarStyles.itemName}>
                {w.name}
              </span>
              <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                {onAddProject && projects.some((p) => !w.projectIds.includes(p.id)) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddProject(w.id) }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="sidebar-icon-button"
                    style={sidebarStyles.addButton}
                    aria-label={`Add repository to ${w.name}`}
                    title="Add repository to workspace"
                  >
                    +
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
                  className="sidebar-item-row sidebar-repo-row"
                  style={{ ...sidebarStyles.item, paddingLeft: 16 }}
                  title={repo?.path ?? pid}
                >
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
                  >
                    {repoName}
                  </span>
                  <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSpawnAgent(w.id, pid) }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="sidebar-icon-button"
                      style={sidebarStyles.addButton}
                      aria-label={`Start agent in ${repoName}`}
                      title="Start agent here"
                    >
                      &#9654;
                    </button>
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
                  <div key={session.id} style={{ paddingLeft: 12 }}>
                    {renderAgent(session)}
                  </div>
                ))}
                </Fragment>
              )
            })}
            {orphanSessions.map((session) => (
              <div key={session.id} style={{ paddingLeft: 12 }}>
                {renderAgent(session)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
