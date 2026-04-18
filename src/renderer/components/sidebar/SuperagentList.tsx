import { useCallback, useState } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('360px')

interface SuperagentListProps {
  superagents: Superagent[]
  activeSuperagentId: string | null
  onSelect: (id: string) => void
  onRemove?: (id: string) => Promise<void>
}

export function SuperagentList({
  superagents,
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
  return (
    <>
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Superagents
        </div>
        {superagents.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="sidebar-item-row"
            style={{
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: 4,
              background: s.id === activeSuperagentId ? 'var(--bg-secondary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {s.fleetProjectIds.length} repos · {s.status}
              </div>
            </div>
            {onRemove && (
              <div className="sidebar-item-actions">
                <button
                  type="button"
                  onClick={(e) => handleRequestDelete(e, s)}
                  className="sidebar-icon-button"
                  style={sidebarStyles.agentDeleteButton}
                  aria-label={`Remove ${s.name}`}
                  title="Remove superagent"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        ))}
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
