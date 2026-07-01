import React, { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SpawnAgentOptions, AgentRuntime, BranchInfo, PRInfo, AgentSession } from '../../../shared/types'
import { ConfirmDialog } from '../ConfirmDialog'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField } from '../new-task'
import type { ExistingSubTab } from '../new-task'
import { pickRandomNorwegianCityName } from '../../../shared/norwegian-cities'
import { ReusableSessionsCard } from './ReusableSessionsCard'
import { NewAgentAdvanced } from './NewAgentAdvanced'
import { NewAgentModePill } from './NewAgentModePill'
import { AgentDropdown } from '../new-task/AgentDropdown'

type AgentMode = 'interactive' | 'chat'

export function NewAgentForm({
  projectId,
  projectPath,
  baseBranch,
  isGitProject,
  defaultRuntime,
  defaultAgentMode = 'interactive',
  defaultUseWorktrees = true,
  onLaunch,
  existingSessions = [],
  onResumeSession,
  onDeleteSession,
  focusTrigger,
  compact = false,
}: {
  projectId: string
  projectPath: string
  baseBranch: string
  isGitProject: boolean
  defaultRuntime: string
  defaultAgentMode?: AgentMode
  defaultUseWorktrees?: boolean
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  existingSessions?: AgentSession[]
  onResumeSession?: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession?: (session: AgentSession) => void
  focusTrigger?: number
  compact?: boolean
}): React.JSX.Element {
  const [mode, setMode] = useState<AgentMode>(defaultAgentMode)
  const [runWithoutWorktree, setRunWithoutWorktree] = useState(!defaultUseWorktrees)
  const [taskDescription, setTaskDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [loading, setLoading] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [useExisting, setUseExisting] = useState(false)
  const [existingSubTab, setExistingSubTab] = useState<ExistingSubTab>('branch')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [prs, setPrs] = useState<PRInfo[]>([])
  const [prFilter, setPrFilter] = useState('')
  const [selectedPr, setSelectedPr] = useState<number | null>(null)
  const [prsLoading, setPrsLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pendingDirtyLaunch, setPendingDirtyLaunch] = useState<SpawnAgentOptions | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    // Set true on mount (not just via useRef's initial value): under React
    // StrictMode the effect runs setup → cleanup → setup, and without this the
    // cleanup's `false` would stick after remount, aborting later async work.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusTrigger])

  useEffect(() => {
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [])

  useEffect(() => {
    if (!isGitProject) return
    if (!useExisting || existingSubTab !== 'branch') return
    setBranchesLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-branches', projectId)
      .then((list) => setBranches(list as BranchInfo[]))
      .catch((err) => setError(`Failed to load branches: ${(err as Error).message}`))
      .finally(() => setBranchesLoading(false))
  }, [useExisting, existingSubTab, isGitProject, projectId])

  useEffect(() => {
    if (!isGitProject) return
    if (!useExisting || existingSubTab !== 'pr') return
    setPrsLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-prs', projectId)
      .then((list) => setPrs(list as PRInfo[]))
      .catch((err) => setError(`Failed to load PRs: ${(err as Error).message}`))
      .finally(() => setPrsLoading(false))
  }, [useExisting, existingSubTab, isGitProject, projectId])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false
  const reusableSessions = existingSessions.filter((session) => (
    (session.status === 'done' || session.status === 'error')
    && !session.noWorktree
    && !session.groupId
  ))
  const inPlaceAgentRunning = existingSessions.some(
    (session) => session.noWorktree && (session.status === 'running' || session.status === 'waiting')
  )
  const willRunInPlace = runWithoutWorktree || useExisting

  const canSubmit = (() => {
    if (!runtimeInstalled) return false
    if (useExisting && existingSubTab === 'branch' && !selectedBranch) return false
    if (useExisting && existingSubTab === 'pr' && selectedPr === null) return false
    return true
  })()

  const runLaunch = useCallback(
    async (finalOptions: SpawnAgentOptions): Promise<void> => {
      setError('')
      setLoading(true)
      try {
        const session = await onLaunch(finalOptions)
        if (!session && mountedRef.current) {
          setError('Failed to start agent.')
        }
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : String(err)
          setError(`Failed to start agent: ${message}`)
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [onLaunch]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      if (!canSubmit) return
      setError('')
      const resolvedTaskDescription = taskDescription.trim() || pickRandomNorwegianCityName()
      setTaskDescription(resolvedTaskDescription)

      const launchOptions = (() => {
        if (!isGitProject) {
          return {
            projectId,
            runtimeId,
            prompt: resolvedTaskDescription,
            noWorktree: true,
          } satisfies SpawnAgentOptions
        }

        const base: SpawnAgentOptions = {
          projectId,
          runtimeId,
          prompt: resolvedTaskDescription,
        }

        // Selecting a branch or PR works in place on it (no worktree);
        // leaving the picker empty creates a new worktree from the base branch.
        if (useExisting && existingSubTab === 'branch') {
          return { ...base, existingBranch: selectedBranch, noWorktree: true }
        }
        if (useExisting && existingSubTab === 'pr') {
          return { ...base, prIdentifier: String(selectedPr), noWorktree: true }
        }
        return runWithoutWorktree ? { ...base, noWorktree: true } : base
      })()

      const finalOptions: SpawnAgentOptions = { ...launchOptions, nonInteractive: mode === 'chat' }

      // Persist the chosen mode so the next New Agent form (any repo) defaults to it.
      // Done at submit (not on every pill click) to avoid flooding all renderers
      // with settings:changed broadcasts when the user toggles back and forth.
      if (mode !== defaultAgentMode) {
        window.electronAPI.invoke('settings:update', { defaultAgentMode: mode }).catch((err) => {
          console.error('[NewAgentForm] failed to persist defaultAgentMode:', err)
        })
      }

      // A no-worktree new-branch spawn switches the project's real working copy
      // to a new branch. If it has uncommitted changes, confirm before carrying
      // them along (existing-branch/PR checkouts already tolerate a dirty tree).
      const isNewBranchInPlace = isGitProject && runWithoutWorktree && !useExisting
      if (isNewBranchInPlace) {
        setLoading(true)
        let dirty = false
        try {
          dirty = Boolean(await window.electronAPI.invoke('git:has-uncommitted-changes', projectId))
        } catch {
          dirty = false
        }
        if (!mountedRef.current) return
        if (dirty) {
          setLoading(false)
          setPendingDirtyLaunch(finalOptions)
          return
        }
      }

      await runLaunch(finalOptions)
    },
    [useExisting, existingSubTab, projectId, runtimeId, taskDescription, selectedBranch, selectedPr, canSubmit, isGitProject, mode, defaultAgentMode, runWithoutWorktree, runLaunch]
  )

  const confirmDirtyLaunch = useCallback((): void => {
    const opts = pendingDirtyLaunch
    if (!opts) return
    setPendingDirtyLaunch(null)
    void runLaunch({ ...opts, allowDirtyWorktree: true })
  }, [pendingDirtyLaunch, runLaunch])

  const dirtyConfirmDialog = pendingDirtyLaunch
    ? createPortal(
        <ConfirmDialog
          title="Uncommitted changes"
          message="This repository has uncommitted changes. Starting an agent without a worktree switches your working copy to a new branch and carries those changes along. Continue?"
          confirmLabel="Continue"
          onConfirm={confirmDirtyLaunch}
          onCancel={() => setPendingDirtyLaunch(null)}
        />,
        document.body,
      )
    : null

  const formStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 420, maxWidth: '90%' } as const

  if (compact) {
    return (
      <form onSubmit={handleSubmit} style={formStyle}>
        <TaskDescriptionField
          value={taskDescription}
          onChange={setTaskDescription}
          inputRef={inputRef}
          canSubmit={canSubmit}
          loading={loading}
        />
        <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
        {error && <p style={modalStyles.errorText}>{error}</p>}
        <NewAgentModePill mode={mode} setMode={setMode} canSubmit={canSubmit} loading={loading} />
        {dirtyConfirmDialog}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <ReusableSessionsCard
        projectPath={projectPath}
        sessions={reusableSessions}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
      />

      {!isGitProject && (
        <p style={modalStyles.infoText}>
          This folder is not a Git repository. The agent will work directly in the folder and can still read and edit documents.
        </p>
      )}

      <TaskDescriptionField
        value={taskDescription}
        onChange={setTaskDescription}
        inputRef={inputRef}
        canSubmit={canSubmit}
        loading={loading}
      />

      {error && <p style={modalStyles.errorText}>{error}</p>}

      {willRunInPlace && inPlaceAgentRunning && (
        <p style={modalStyles.infoText}>
          ⚠ An agent is already running directly in this repository. Only one in-place agent runs per repo — starting will switch to the existing one.
        </p>
      )}

      <NewAgentModePill mode={mode} setMode={setMode} canSubmit={canSubmit} loading={loading} />

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
          runWithoutWorktree={runWithoutWorktree}
          setRunWithoutWorktree={setRunWithoutWorktree}
          runtimeId={runtimeId}
          runtimes={runtimes}
          setRuntimeId={setRuntimeId}
          runtimeInstalled={runtimeInstalled}
          selectedRuntime={selectedRuntime}
          useExisting={useExisting}
          setUseExisting={setUseExisting}
          existingSubTab={existingSubTab}
          setExistingSubTab={setExistingSubTab}
          branches={branches}
          baseBranch={baseBranch}
          branchFilter={branchFilter}
          setBranchFilter={setBranchFilter}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          branchesLoading={branchesLoading}
          prs={prs}
          prFilter={prFilter}
          setPrFilter={setPrFilter}
          selectedPr={selectedPr}
          setSelectedPr={setSelectedPr}
          prsLoading={prsLoading}
        />
      )}
      {dirtyConfirmDialog}
    </form>
  )
}
