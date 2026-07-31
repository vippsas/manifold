import React from 'react'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField, AgentDropdown, BranchPicker, PRPicker } from '../new-task'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { heroStyles } from './NewAgentHero.styles'
import { NewAgentHeroCard, ChatGlyph, TerminalGlyph, BranchGlyph, WorktreeGlyph } from './NewAgentHeroCard'
import { useNewAgentForm } from './useNewAgentForm'
import type { NewAgentProps } from './useNewAgentForm'

/**
 * The full-panel start view: the wordmark above it, then the repository, a name,
 * and the ways to start as cards you click to launch. Same state and same launch
 * as the compact form — only the presentation differs.
 */
export function NewAgentHero(props: NewAgentProps & { projectName: string }): React.JSX.Element {
  const {
    projectName,
    projectPath,
    baseBranch,
    isGitProject,
    defaultAgentMode = 'interactive',
    onResumeSession,
    onDeleteSession,
  } = props
  const f = useNewAgentForm(props)

  const busy = !f.canSubmit || f.loading
  const actionLabel = (label: string, mode: 'interactive' | 'chat'): string => (
    f.loading && f.mode === mode ? 'Starting…' : label
  )

  // Says where the agent will end up rather than what the click does, so the
  // caption never reads as the opposite of the label above it.
  const worktreeCaption = f.useExisting
    ? 'Works in your repository, on the chosen branch'
    : f.runWithoutWorktree
      ? 'Works in your repository'
      : 'Gets its own isolated worktree'

  const existingCaption = !f.useExisting
    ? 'Starts on a new branch'
    : f.existingSubTab === 'branch'
      ? f.selectedBranch || 'Choose a branch below'
      : f.selectedPr !== null ? `Pull request #${f.selectedPr}` : 'Choose a pull request below'

  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit() }} style={heroStyles.column}>
      <div style={heroStyles.contextLine}>
        <span style={heroStyles.contextProject}>{projectName}</span>
        {isGitProject && <span style={heroStyles.contextMeta}>{baseBranch}</span>}
      </div>

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

      {isGitProject && (
        <div style={heroStyles.grid}>
          <NewAgentHeroCard
            variant="option"
            icon={WorktreeGlyph}
            label="Run without a worktree"
            caption={worktreeCaption}
            pressed={f.runWithoutWorktree || f.useExisting}
            disabled={f.useExisting || f.loading}
            onClick={() => f.setRunWithoutWorktree(!f.runWithoutWorktree)}
          />
          <NewAgentHeroCard
            variant="option"
            icon={BranchGlyph}
            label="Continue on an existing branch or PR"
            caption={existingCaption}
            pressed={f.useExisting}
            disabled={f.loading}
            onClick={() => f.setUseExisting(!f.useExisting)}
          />
        </div>
      )}

      {f.useExisting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <div style={modalStyles.subTabBar}>
            <button type="button" onClick={() => f.setExistingSubTab('branch')} style={{ ...modalStyles.subTab, ...(f.existingSubTab === 'branch' ? modalStyles.subTabActive : {}) }}>
              Branch
            </button>
            <button type="button" onClick={() => f.setExistingSubTab('pr')} style={{ ...modalStyles.subTab, ...(f.existingSubTab === 'pr' ? modalStyles.subTabActive : {}) }}>
              Pull Request
            </button>
          </div>
          {f.existingSubTab === 'branch' && (
            <BranchPicker branches={f.branches} baseBranch={baseBranch} allowBaseBranch filter={f.branchFilter} onFilterChange={f.setBranchFilter} selected={f.selectedBranch} onSelect={f.setSelectedBranch} loading={f.branchesLoading} />
          )}
          {f.existingSubTab === 'pr' && (
            <PRPicker prs={f.prs} filter={f.prFilter} onFilterChange={f.setPrFilter} selected={f.selectedPr} onSelect={f.setSelectedPr} loading={f.prsLoading} />
          )}
        </div>
      )}

      <AgentDropdown value={f.runtimeId} onChange={f.setRuntimeId} runtimes={f.runtimes} />

      {!f.runtimeInstalled && (
        <p style={modalStyles.errorText}>
          {f.selectedRuntime?.name ?? f.runtimeId} is not installed. Please install it first.
        </p>
      )}

      {!isGitProject && (
        <p style={modalStyles.infoText}>
          This folder is not a Git repository. The agent will work directly in the folder and can still read and edit documents.
        </p>
      )}

      {f.error && <p style={modalStyles.errorText}>{f.error}</p>}

      {f.willRunInPlace && f.inPlaceAgentRunning && (
        <p style={modalStyles.infoText}>
          ⚠ An agent is already running directly in this repository. Only one in-place agent runs per repo — starting will switch to the existing one.
        </p>
      )}

      <ReusableSessionsCard
        projectPath={projectPath}
        sessions={f.reusableSessions}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
      />

      {f.dirtyConfirmDialog}
    </form>
  )
}
