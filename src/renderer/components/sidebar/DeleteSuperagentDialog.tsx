import { useCallback } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('360px')

interface DeleteSuperagentDialogProps {
  superagent: Superagent
  deleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function DeleteSuperagentDialog({
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
