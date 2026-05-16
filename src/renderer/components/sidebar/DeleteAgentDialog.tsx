import React, { useCallback } from 'react'
import type { AgentSession } from '../../../shared/types'
import { formatBranchLabel, runtimeLabel } from './AgentItem'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('360px')

export interface PendingDelete {
  session: AgentSession
  projectPath: string
}

interface DeleteAgentDialogProps {
  pendingDelete: PendingDelete | null
  siblingCount: number
  deleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function DeleteAgentDialog({
  pendingDelete,
  siblingCount,
  deleting,
  onCancel,
  onConfirm,
}: DeleteAgentDialogProps): React.JSX.Element | null {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape' && !deleting) onCancel()
    },
    [deleting, onCancel]
  )

  if (!pendingDelete) return null

  const { session, projectPath } = pendingDelete
  const label = formatBranchLabel(session.branchName, projectPath)
  const multi = siblingCount > 1
  const actionText = session.noWorktree
    ? 'This will stop the agent.'
    : multi
      ? `This will stop all ${siblingCount} agents on this worktree and remove the worktree.`
      : 'This will stop the agent and remove its worktree.'

  return (
    <div
      onClick={deleting ? undefined : onCancel}
      onKeyDown={handleKeyDown}
      style={deleteDialogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Delete agent"
    >
      <div style={deleteDialogStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={deleteDialogStyles.header}>
          <span style={deleteDialogStyles.title}>Delete agent</span>
          <button
            type="button"
            onClick={onCancel}
            style={deleteDialogStyles.closeButton}
            aria-label="Close delete dialog"
            disabled={deleting}
          >
            &times;
          </button>
        </div>
        <div style={deleteDialogStyles.body}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{label}</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}>
              {runtimeLabel(session.runtimeId)}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {actionText} The local branch will be kept.
          </p>
        </div>
        <div style={deleteDialogStyles.footer}>
          <button type="button" onClick={onCancel} style={deleteDialogStyles.secondaryButton} disabled={deleting}>Cancel</button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            style={{ ...deleteDialogStyles.primaryButton, background: 'var(--error)' }}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
