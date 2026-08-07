import React, { useCallback, useRef } from 'react'
import type { Workspace } from '../../../shared/workspace-types'
import { NewAgentForm } from './NewAgentForm'
import type { NewAgentLaunchOptions } from './useNewAgentForm'
import { newAgentModalStyles as styles } from './NewAgentModal.styles'

interface NewAgentModalProps {
  visible: boolean
  /** The workspace the agent joins. An agent has no other scope. */
  workspace: Workspace | null
  defaultRuntime: string
  defaultAgentMode: 'interactive' | 'chat'
  onLaunch: (options: NewAgentLaunchOptions) => Promise<unknown>
  onClose: () => void
}

export function NewAgentModal({
  visible,
  workspace,
  defaultRuntime,
  defaultAgentMode,
  onLaunch,
  onClose,
}: NewAgentModalProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleLaunch = useCallback(async (options: NewAgentLaunchOptions): Promise<unknown> => {
    const session = await onLaunch(options)
    if (session) onClose()
    return session
  }, [onClose, onLaunch])

  if (!visible || !workspace) return null

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`New agent in ${workspace.name}`}
      onClick={(event) => { if (event.target === overlayRef.current) onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
    >
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.heading}>
            <span style={styles.title}>New Agent</span>
            <span style={styles.context}>{workspace.name}</span>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close new agent dialog">&times;</button>
        </div>
        <div style={styles.body}>
          <NewAgentForm
            key={workspace.id}
            workspaceName={workspace.name}
            primaryPath={workspace.worktreePaths?.[workspace.projectIds[0]] ?? ''}
            defaultRuntime={workspace.runtimeId ?? defaultRuntime}
            defaultAgentMode={defaultAgentMode}
            onLaunch={handleLaunch}
          />
        </div>
      </div>
    </div>
  )
}
