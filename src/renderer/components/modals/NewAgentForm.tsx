import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField } from '../new-task'
import { NewAgentModePill } from './NewAgentModePill'
import { AgentRuntimePicker } from '../new-task/AgentRuntimePicker'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/** The dialog's layout: a label, a runtime, Terminal or Chat. Everything else an
 *  agent used to ask for — repo, branch, worktree — the workspace already
 *  answers. The full-panel start view (`NewAgentHero`) offers the same fields as
 *  cards, plus the workspace's finished agents to resume. */
export function NewAgentForm(props: NewAgentProps): React.JSX.Element {
  const f = useNewAgentForm(props)

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void f.submit() }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 420, maxWidth: '90%' }}
    >
      <TaskDescriptionField
        value={f.taskDescription}
        onChange={f.setTaskDescription}
        inputRef={f.inputRef}
        canSubmit={f.canSubmit}
        loading={f.loading}
      />
      <AgentRuntimePicker value={f.runtimeId} onChange={f.setRuntimeId} runtimes={f.runtimes} />
      {!f.runtimeInstalled && (
        <p style={modalStyles.errorText}>
          {f.selectedRuntime?.name ?? f.runtimeId} is not installed. Please install it first.
        </p>
      )}
      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}
      <NewAgentModePill mode={f.mode} setMode={f.setMode} canSubmit={f.canSubmit} loading={f.loading} />
    </form>
  )
}
