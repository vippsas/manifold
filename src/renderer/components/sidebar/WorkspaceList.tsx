import { useCallback, useState } from 'react'
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
  onSpawnAgent: (workspaceId: string) => void
  onAddProject?: (workspaceId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
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
  onDeleteAgent,
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

  if (workspaces.length === 0) return null

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={sidebarStyles.sectionLabel}>Workspaces</div>
      {workspaces.map((w) => {
        const isActive = w.id === activeWorkspaceId
        const sessions = sessionsByWorkspace[w.id] ?? []

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
              return (
                <div
                  key={`repo-${pid}`}
                  className="sidebar-item-row sidebar-repo-row"
                  style={{ ...sidebarStyles.item, paddingLeft: 16 }}
                  title={repo?.path ?? pid}
                >
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
                  >
                    {repo?.name ?? pid}
                  </span>
                </div>
              )
            })}
            {sessions.map((session) => {
              const project = projectById(session.projectId)
              return (
                <AgentItem
                  key={session.id}
                  session={session}
                  projectPath={project?.path ?? ''}
                  isActive={session.id === activeSessionId}
                  isOutputting={outputtingSessionIds?.has(session.id) ?? false}
                  onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
                  onDelete={() => onDeleteAgent?.(session, project?.path ?? '')}
                  labelOverride={project?.name}
                  hideAdditionalDirs
                />
              )
            })}
            <div
              onClick={() => onSpawnAgent(w.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSpawnAgent(w.id)
                }
              }}
              role="button"
              tabIndex={0}
              className="sidebar-item-row sidebar-agent-row sidebar-agent-row--exited"
              title="Start an agent across this workspace"
            >
              <span
                className="truncate sidebar-row-label"
                style={{ ...sidebarStyles.agentBranch, color: 'var(--text-muted)', fontStyle: 'italic' }}
              >
                + Start agent
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
