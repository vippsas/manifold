import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { heroStyles } from './NewAgentHero.styles'
import { AgentLaunchList } from './AgentLaunchList'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/**
 * The full-panel start view: the workspace's providers as a list you click to
 * launch, and its finished agents to resume below. Same state and same launch
 * as the dialog's form — only the width differs.
 */
export function NewAgentHero(props: NewAgentProps & { branchLabel?: string }): React.JSX.Element {
  const { primaryPath, onResumeSession, onDeleteSession, focusTrigger } = props
  const f = useNewAgentForm(props)

  return (
    <div style={heroStyles.column}>
      <AgentLaunchList
        runtimes={f.runtimes}
        pending={f.pending}
        onLaunch={(runtimeId, mode) => void f.launch(runtimeId, mode)}
        focusTrigger={focusTrigger}
      />

      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}

      <ReusableSessionsCard
        projectPath={primaryPath}
        sessions={f.reusableSessions}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
      />
    </div>
  )
}
