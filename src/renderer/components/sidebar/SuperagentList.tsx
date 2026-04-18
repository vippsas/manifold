import { useCallback, useState } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import type { Project } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('360px')

interface SuperagentListProps {
  superagents: Superagent[]
  projects: Project[]
  activeSuperagentId: string | null
  onSelect: (id: string) => void
  onRemove?: (id: string) => Promise<void>
}

export function SuperagentList({
  superagents,
  projects,
  activeSuperagentId,
  onSelect,
  onRemove,
}: SuperagentListProps) {
  const [pendingDelete, setPendingDelete] = useState<Superagent | null>(null)
  const [deleting, setDeleting] = useState(false)

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
              <div
                key={s.id}
                className="sidebar-project-group sidebar-project-group--active sidebar-project-group--has-agents"
              >
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
                  {onRemove && (
                    <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                      <button
                        type="button"
                        onClick={(e) => handleRequestDelete(e, s)}
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
                  <span className="truncate">{repoLabel(s)} &middot; {s.status}</span>
                </div>
              </div>
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

interface DeleteSuperagentDialogProps {
  superagent: Superagent
  deleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

function DeleteSuperagentDialog({
  superagent,
  deleting,
  onCancel,
  onConfirm,
}: DeleteSuperagentDialogProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape' && !deleting) onCancel()
    },
    [deleting, onCancel]
  )

  const isRunning = superagent.status === 'running' || superagent.status === 'waiting'
  const actionText = isRunning
    ? 'This will stop the superagent and remove its coordination state.'
    : 'This will remove the superagent and its coordination state.'

  return (
    <div
      onClick={deleting ? undefined : onCancel}
      onKeyDown={handleKeyDown}
      style={deleteDialogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Remove superagent"
    >
      <div style={deleteDialogStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={deleteDialogStyles.header}>
          <span style={deleteDialogStyles.title}>Remove superagent</span>
          <button
            type="button"
            onClick={onCancel}
            style={deleteDialogStyles.closeButton}
            aria-label="Close remove dialog"
            disabled={deleting}
          >
            &times;
          </button>
        </div>
        <div style={deleteDialogStyles.body}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{superagent.name}</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}>
              {superagent.fleetProjectIds.length} repos · {superagent.status}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {actionText} Child agent worktrees are not touched.
          </p>
        </div>
        <div style={deleteDialogStyles.footer}>
          <button type="button" onClick={onCancel} style={deleteDialogStyles.secondaryButton} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            style={{ ...deleteDialogStyles.primaryButton, background: 'var(--error)' }}
            disabled={deleting}
          >
            {deleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
