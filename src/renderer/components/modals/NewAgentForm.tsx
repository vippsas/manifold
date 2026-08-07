import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { AgentLaunchList } from './AgentLaunchList'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/** The dialog's layout: the same provider list as the full-panel start view,
 *  just narrower. Everything an agent used to ask for — name, repo, branch,
 *  worktree — the workspace already answers. */
export function NewAgentForm(props: NewAgentProps): React.JSX.Element {
  const f = useNewAgentForm(props)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', width: 420, maxWidth: '90%' }}>
      <AgentLaunchList
        runtimes={f.runtimes}
        pending={f.pending}
        onLaunch={(runtimeId, mode) => void f.launch(runtimeId, mode)}
        focusTrigger={props.focusTrigger}
        leadRuntimeId={props.defaultRuntime}
      />
      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}
    </div>
  )
}
