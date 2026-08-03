import React, { useCallback } from 'react'
import type { AgentSession } from '../../../shared/types'
import { runtimeLabel } from './agent-labels'
import { createDialogStyles } from '../workbench-style-primitives'

const deleteDialogStyles = createDialogStyles('420px')

function basename(input: string): string {
  const parts = input.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? input
}

function describeWorktree(projectPath: string, worktreePath: string): string {
  if (worktreePath === projectPath) return basename(projectPath)
  return basename(worktreePath)
}

export interface PendingDelete {
  session: AgentSession
  projectPath: string
}

interface DeleteAgentDialogProps {
  pendingDelete: PendingDelete | null
  deleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function DeleteAgentDialog({
  pendingDelete,
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
  const repoName = basename(projectPath)
  const worktreeName = describeWorktree(projectPath, session.worktreePath)
  const agentLabel = session.displayName?.trim() || runtimeLabel(session.runtimeId)

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
            <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--type-ui-small)' }}>{repoName}</strong>
            <span
              style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`Worktree: ${worktreeName}`}
            >
              {`Worktree: ${worktreeName}`}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-caption)' }}>
              {`Agent: ${agentLabel}`}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Close this agent.
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.4, fontSize: 'var(--type-ui-small)' }}>
              The folders stay as they are — they belong to the workspace, and
              removing that is what removes them.
            </p>
          </div>
        </div>
        <div style={deleteDialogStyles.footer}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...deleteDialogStyles.secondaryButton,
              color: 'var(--text-muted)',
              background: 'transparent',
            }}
            disabled={deleting}
          >
            Cancel
          </button>
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
