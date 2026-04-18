import type { Superagent } from '../../../shared/superagent-types'
import type { AgentSession, Project } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'

interface ActiveSuperagentGroupProps {
  superagent: Superagent
  projects: Project[]
  title: string
  repoLabel: string
  alive: boolean
  allProjectSessions?: Record<string, AgentSession[]>
  activeSessionId?: string | null
  outputtingSessionIds?: Set<string>
  spawningKey: string | null
  onSelect: (id: string) => void
  onSelectSession?: (sessionId: string, projectId: string) => void
  onSpawnFleetAgent: (superagentId: string, projectId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
  onRequestDelete?: (e: React.MouseEvent) => void
  canRemove: boolean
}

export function ActiveSuperagentGroup({
  superagent: s,
  projects,
  title,
  repoLabel,
  alive,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  spawningKey,
  onSelect,
  onSelectSession,
  onSpawnFleetAgent,
  onDeleteAgent,
  onRequestDelete,
  canRemove,
}: ActiveSuperagentGroupProps) {
  return (
    <div className="sidebar-project-group sidebar-project-group--active sidebar-project-group--has-agents">
      <div
        onClick={() => onSelect(s.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(s.id)
          }
        }}
        role="button"
        tabIndex={0}
        className="sidebar-item-row sidebar-project-row sidebar-item-row--active"
        style={{ ...sidebarStyles.item, ...sidebarStyles.itemActive, position: 'relative' as const }}
        title={title}
      >
        <span className="truncate sidebar-row-label" style={sidebarStyles.itemName}>
          {s.name}
        </span>
        {canRemove && onRequestDelete && (
          <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
            <button
              type="button"
              onClick={onRequestDelete}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.removeButton}
              aria-label={`Remove ${s.name}`}
              title="Remove superagent"
            >
              &times;
            </button>
          </div>
        )}
      </div>
      <div style={{ ...sidebarStyles.fetchMessage, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={`status-dot${alive ? '' : ' status-dot--hidden'}`} style={{ width: 6, height: 6 }} />
        <span className="truncate">{repoLabel} &middot; {s.status}</span>
      </div>
      {s.fleetProjectIds.map((projectId) => {
        const project = projects.find((p) => p.id === projectId)
        if (!project) return null
        const projectSessions = allProjectSessions?.[projectId] ?? []
        const childSession = projectSessions.find(
          (ps) => s.childSessionIds.includes(ps.id) && ps.worktreePath === s.fleetWorktreePaths?.[projectId],
        )
        const branchSuffix = childSession
          ? childSession.branchName.replace(/^manifold\//, '')
          : s.branchName.replace(/^manifold\//, '')
        const combinedLabel = `${project.name}/${branchSuffix}`
        if (childSession && onSelectSession) {
          return (
            <AgentItem
              key={`${s.id}:${projectId}`}
              session={childSession}
              projectPath={project.path}
              isActive={childSession.id === activeSessionId}
              isOutputting={outputtingSessionIds?.has(childSession.id) ?? false}
              onSelect={(sessionId) => onSelectSession(sessionId, projectId)}
              onDelete={() => onDeleteAgent?.(childSession, project.path)}
              labelOverride={combinedLabel}
            />
          )
        }
        const key = `${s.id}:${projectId}`
        const isSpawning = spawningKey === key
        return (
          <div
            key={key}
            onClick={() => { if (!isSpawning) onSpawnFleetAgent(s.id, projectId) }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isSpawning) {
                e.preventDefault()
                onSpawnFleetAgent(s.id, projectId)
              }
            }}
            role="button"
            tabIndex={0}
            className="sidebar-item-row sidebar-agent-row sidebar-agent-row--exited"
            title={`Start agent in ${project.name}`}
          >
            <div className="sidebar-agent-main">
              <span className="status-dot status-dot--hidden" />
              <span
                className="truncate sidebar-row-label"
                style={{
                  ...sidebarStyles.agentBranch,
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                  flex: 1,
                }}
              >
                {combinedLabel}
              </span>
            </div>
            <span className="truncate sidebar-secondary-text" style={{ paddingLeft: '16px' }}>
              {isSpawning ? 'Starting…' : 'Click to start agent'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
