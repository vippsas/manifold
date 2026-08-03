import React, { useCallback, useRef } from 'react'
import type { AgentSession, Project, SpawnAgentOptions } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { isGitProject } from '../../../shared/project-kind'
import { NewAgentForm } from './NewAgentForm'
import { newAgentModalStyles as styles } from './NewAgentModal.styles'

interface NewAgentModalProps {
  visible: boolean
  project: Project | null
  workspace?: Workspace | null
  existingSessions: AgentSession[]
  defaultRuntime: string
  defaultAgentMode: 'interactive' | 'chat'
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  onResumeSession: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession: (session: AgentSession) => void
  onClose: () => void
}

export function NewAgentModal({
  visible,
  project,
  workspace,
  existingSessions,
  defaultRuntime,
  defaultAgentMode,
  onLaunch,
  onResumeSession,
  onDeleteSession,
  onClose,
}: NewAgentModalProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleLaunch = useCallback(async (options: SpawnAgentOptions): Promise<unknown> => {
    const session = await onLaunch(options)
    if (session) onClose()
    return session
  }, [onClose, onLaunch])

  if (!visible || !project) return null

  const context = workspace
    ? `${workspace.name} · ${project.name}`
    : project.name

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`New agent in ${context}`}
      onClick={(event) => { if (event.target === overlayRef.current) onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
    >
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.heading}>
            <span style={styles.title}>New Agent</span>
            <span style={styles.context}>{context}</span>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close new agent dialog">&times;</button>
        </div>
        <div style={styles.body}>
          <NewAgentForm
            key={`${workspace?.id ?? 'repo'}:${project.id}`}
            projectId={project.id}
            projectPath={project.path}
            baseBranch={project.baseBranch}
            isGitProject={isGitProject(project)}
            defaultRuntime={workspace?.runtimeId ?? defaultRuntime}
            defaultAgentMode={defaultAgentMode}
            onLaunch={handleLaunch}
            existingSessions={existingSessions}
            onResumeSession={onResumeSession}
            onDeleteSession={onDeleteSession}
            compact={!!workspace}
          />
        </div>
      </div>
    </div>
  )
}
