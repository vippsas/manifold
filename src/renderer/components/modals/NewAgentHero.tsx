import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField, AgentDropdown } from '../new-task'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { heroStyles } from './NewAgentHero.styles'
import { NewAgentHeroCard, ChatGlyph, TerminalGlyph } from './NewAgentHeroCard'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/**
 * The full-panel start view: the workspace it will work in, a name, and the ways
 * to start as cards you click to launch. Same state and same launch as the
 * dialog's form — only the presentation differs.
 */
export function NewAgentHero(props: NewAgentProps & { branchLabel?: string }): React.JSX.Element {
  const {
    primaryPath,
    branchLabel,
    defaultAgentMode = 'interactive',
    onResumeSession,
    onDeleteSession,
  } = props
  const f = useNewAgentForm(props)

  const busy = !f.canSubmit || f.loading
  const actionLabel = (label: string, mode: 'interactive' | 'chat'): string => (
    f.loading && f.mode === mode ? 'Starting…' : label
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit() }} style={heroStyles.column}>
      {/* The workspace is already named above this form; all that's left to say
          is which branch its folders are on. */}
      {branchLabel && (
        <div style={heroStyles.contextLine}>
          <span style={heroStyles.contextMeta}>{branchLabel}</span>
        </div>
      )}

      <TaskDescriptionField
        value={f.taskDescription}
        onChange={f.setTaskDescription}
        inputRef={f.inputRef}
        canSubmit={f.canSubmit}
        loading={f.loading}
      />

      <div style={heroStyles.grid}>
        <NewAgentHeroCard
          variant="action"
          icon={ChatGlyph}
          label={actionLabel('Start Chat', 'chat')}
          caption="Talk to the agent in Manifold"
          onClick={() => void f.submit('chat')}
          disabled={busy}
          hint={defaultAgentMode === 'chat' ? '↵' : undefined}
        />
        <NewAgentHeroCard
          variant="action"
          icon={TerminalGlyph}
          label={actionLabel('Start Terminal', 'interactive')}
          caption="Run the agent in its own terminal"
          onClick={() => void f.submit('interactive')}
          disabled={busy}
          hint={defaultAgentMode === 'interactive' ? '↵' : undefined}
        />
      </div>

      {/* No branch, PR or worktree choice: this agent works where the workspace
          works. Another branch over these folders is another workspace, copied
          from this one in the sidebar. */}

      <AgentDropdown value={f.runtimeId} onChange={f.setRuntimeId} runtimes={f.runtimes} />

      {!f.runtimeInstalled && (
        <p style={modalStyles.errorText}>
          {f.selectedRuntime?.name ?? f.runtimeId} is not installed. Please install it first.
        </p>
      )}

      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}

      <ReusableSessionsCard
        projectPath={primaryPath}
        sessions={f.reusableSessions}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
      />
    </form>
  )
}
