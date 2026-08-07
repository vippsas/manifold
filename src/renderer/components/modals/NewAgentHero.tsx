import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { heroStyles } from './NewAgentHero.styles'
import { AgentLaunchList } from './AgentLaunchList'
import { ManifoldWordmark } from '../ManifoldWordmark'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/**
 * The full-panel start view: the workspace's providers as a list you click to
 * launch, and its finished agents to resume below. Same state and same launch
 * as the dialog's form — only the width and the masthead differ.
 */
export function NewAgentHero(props: NewAgentProps & { branchLabel?: string }): React.JSX.Element {
  const { workspaceName, primaryPath, defaultRuntime, onResumeSession, onDeleteSession, focusTrigger } = props
  const f = useNewAgentForm(props)

  return (
    <div style={heroStyles.column}>
      <header style={heroStyles.masthead}>
        <ManifoldWordmark size="normal" />
        <h1 style={heroStyles.title}>
          New agent for <span style={heroStyles.titleWorkspace}>{workspaceName}</span>
        </h1>
      </header>

      <AgentLaunchList
        runtimes={f.runtimes}
        pending={f.pending}
        onLaunch={(runtimeId, mode) => void f.launch(runtimeId, mode)}
        focusTrigger={focusTrigger}
        leadRuntimeId={defaultRuntime}
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
