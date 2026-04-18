import { useCallback, useState } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import type { AgentSession, Project } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { ActiveSuperagentGroup } from './ActiveSuperagentGroup'
import { DeleteSuperagentDialog } from './DeleteSuperagentDialog'

interface SuperagentListProps {
  superagents: Superagent[]
  projects: Project[]
  activeSuperagentId: string | null
  onSelect: (id: string) => void
  onRemove?: (id: string) => Promise<void>
  allProjectSessions?: Record<string, AgentSession[]>
  activeSessionId?: string | null
  outputtingSessionIds?: Set<string>
  onSelectSession?: (sessionId: string, projectId: string) => void
  onSpawnFleetAgent?: (superagentId: string, projectId: string) => Promise<void>
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
}

export function SuperagentList({
  superagents,
  projects,
  activeSuperagentId,
  onSelect,
  onRemove,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectSession,
  onSpawnFleetAgent,
  onDeleteAgent,
}: SuperagentListProps) {
  const [pendingDelete, setPendingDelete] = useState<Superagent | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [spawningKey, setSpawningKey] = useState<string | null>(null)

  const handleSpawnFleetAgent = useCallback(
    (superagentId: string, projectId: string): void => {
      if (!onSpawnFleetAgent) return
      const key = `${superagentId}:${projectId}`
      setSpawningKey(key)
      void onSpawnFleetAgent(superagentId, projectId).finally(() => {
        setSpawningKey((current) => (current === key ? null : current))
      })
    },
    [onSpawnFleetAgent],
  )

  const handleRequestDelete = useCallback((e: React.MouseEvent, s: Superagent): void => {
    e.stopPropagation()
    setPendingDelete(s)
  }, [])

  const handleCancelDelete = useCallback((): void => {
    if (deleting) return
    setPendingDelete(null)
  }, [deleting])

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete || !onRemove) return
    setDeleting(true)
    try {
      await onRemove(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }, [onRemove, pendingDelete])

  if (superagents.length === 0) return null

  const repoLabel = (s: Superagent): string =>
    s.fleetProjectIds
      .map((id) => projects.find((p) => p.id === id)?.name ?? id)
      .join(', ')

  const isAlive = (status: Superagent['status']): boolean =>
    status === 'running' || status === 'waiting'

  return (
    <>
      <div style={{ paddingTop: 8 }}>
        <div style={sidebarStyles.sectionLabel}>Superagents</div>
        {superagents.map((s) => {
          const isActive = s.id === activeSuperagentId
          const alive = isAlive(s.status)
          const title = `${s.name} — ${repoLabel(s)}`
          if (isActive) {
            return (
              <ActiveSuperagentGroup
                key={s.id}
                superagent={s}
                projects={projects}
                title={title}
                repoLabel={repoLabel(s)}
                alive={alive}
                allProjectSessions={allProjectSessions}
                activeSessionId={activeSessionId}
                outputtingSessionIds={outputtingSessionIds}
                spawningKey={spawningKey}
                onSelect={onSelect}
                onSelectSession={onSelectSession}
                onSpawnFleetAgent={handleSpawnFleetAgent}
                onDeleteAgent={onDeleteAgent}
                onRequestDelete={(e) => handleRequestDelete(e, s)}
                canRemove={Boolean(onRemove)}
              />
            )
          }
          return (
            <div
              key={s.id}
              style={sidebarStyles.collapsedProject}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(s.id)
                }
              }}
              role="button"
              tabIndex={0}
              className="sidebar-project-group sidebar-project-group--has-agents sidebar-project-group--collapsed"
              title={title}
            >
              <span
                className="truncate sidebar-row-label"
                style={{ ...sidebarStyles.item, color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}
              >
                {s.name}
              </span>
              <div style={sidebarStyles.miniStatusDots}>
                {alive && (
                  <span
                    title={s.status}
                    style={{ ...sidebarStyles.miniDot, background: 'var(--accent)' }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {pendingDelete && (
        <DeleteSuperagentDialog
          superagent={pendingDelete}
          deleting={deleting}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
