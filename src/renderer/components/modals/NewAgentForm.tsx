import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField } from '../new-task'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { NewAgentAdvanced } from './NewAgentAdvanced'
import { NewAgentModePill } from './NewAgentModePill'
import { AgentRuntimePicker } from '../new-task/AgentRuntimePicker'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

export function NewAgentForm(props: NewAgentProps & { compact?: boolean }): React.JSX.Element {
  const { projectPath, isGitProject, onResumeSession, onDeleteSession, compact = false } = props
  const f = useNewAgentForm(props)
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    void f.submit()
  }

  const formStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 420, maxWidth: '90%' } as const

  if (compact) {
    return (
      <form onSubmit={handleSubmit} style={formStyle}>
        <TaskDescriptionField
          value={f.taskDescription}
          onChange={f.setTaskDescription}
          inputRef={f.inputRef}
          canSubmit={f.canSubmit}
          loading={f.loading}
        />
        <AgentRuntimePicker value={f.runtimeId} onChange={f.setRuntimeId} runtimes={f.runtimes} />
        {f.error && <p style={modalStyles.errorText}>{f.error}</p>}
        <NewAgentModePill mode={f.mode} setMode={f.setMode} canSubmit={f.canSubmit} loading={f.loading} />
        {f.dirtyConfirmDialog}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <ReusableSessionsCard
        projectPath={projectPath}
        sessions={f.reusableSessions}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
      />

      {!isGitProject && (
        <p style={modalStyles.infoText}>
          This folder is not a Git repository. The agent will work directly in the folder and can still read and edit documents.
        </p>
      )}

      <TaskDescriptionField
        value={f.taskDescription}
        onChange={f.setTaskDescription}
        inputRef={f.inputRef}
        canSubmit={f.canSubmit}
        loading={f.loading}
      />

      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}

      {f.willRunInPlace && f.inPlaceAgentRunning && (
        <p style={modalStyles.infoText}>
          ⚠ An agent is already running directly in this repository. Only one in-place agent runs per repo — starting will switch to the existing one.
        </p>
      )}

      <NewAgentModePill mode={f.mode} setMode={f.setMode} canSubmit={f.canSubmit} loading={f.loading} />

      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        style={modalStyles.advancedToggle}
      >
        <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s', pointerEvents: 'none' }}>&#9654;</span>
        {' '}Advanced
      </button>

      {showAdvanced && (
        <NewAgentAdvanced
          isGitProject={isGitProject}
          runWithoutWorktree={f.runWithoutWorktree}
          setRunWithoutWorktree={f.setRunWithoutWorktree}
          runtimeId={f.runtimeId}
          runtimes={f.runtimes}
          setRuntimeId={f.setRuntimeId}
          runtimeInstalled={f.runtimeInstalled}
          selectedRuntime={f.selectedRuntime}
          useExisting={f.useExisting}
          setUseExisting={f.setUseExisting}
          existingSubTab={f.existingSubTab}
          setExistingSubTab={f.setExistingSubTab}
          branches={f.branches}
          baseBranch={props.baseBranch}
          branchFilter={f.branchFilter}
          setBranchFilter={f.setBranchFilter}
          selectedBranch={f.selectedBranch}
          setSelectedBranch={f.setSelectedBranch}
          branchesLoading={f.branchesLoading}
          prs={f.prs}
          prFilter={f.prFilter}
          setPrFilter={f.setPrFilter}
          selectedPr={f.selectedPr}
          setSelectedPr={f.setSelectedPr}
          prsLoading={f.prsLoading}
        />
      )}
      {f.dirtyConfirmDialog}
    </form>
  )
}
