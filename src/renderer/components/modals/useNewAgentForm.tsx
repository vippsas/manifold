import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SpawnAgentOptions, AgentRuntime, BranchInfo, PRInfo, AgentSession } from '../../../shared/types'
import { ConfirmDialog } from '../ConfirmDialog'
import { pickRandomNorwegianCityName } from '../../../shared/norwegian-cities'
import type { ExistingSubTab } from '../new-task'

export type AgentMode = 'interactive' | 'chat'

export interface NewAgentProps {
  projectId: string
  projectPath: string
  baseBranch: string
  isGitProject: boolean
  defaultRuntime: string
  defaultAgentMode?: AgentMode
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  existingSessions?: AgentSession[]
  onResumeSession?: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession?: (session: AgentSession) => void
  focusTrigger?: number
}

/**
 * Every piece of new-agent state and the launch itself, shared by the two
 * layouts that offer it: the classic form (modal, compact workspace panel) and
 * the hero card grid. `submit` takes an optional mode so a layout can launch
 * straight from a "Start Chat" click without waiting for a `setMode` render.
 */
export function useNewAgentForm({
  projectId,
  isGitProject,
  defaultRuntime,
  defaultAgentMode = 'interactive',
  onLaunch,
  existingSessions = [],
  focusTrigger,
}: NewAgentProps) {
  const [mode, setMode] = useState<AgentMode>(defaultAgentMode)
  // This form starts an agent in the repo's own clone — its home workspace. An
  // agent no longer picks a worktree of its own: a worktree is a workspace, so
  // wanting one means making one, which is why there is no choice here. Only one
  // agent can hold the clone at a time.
  const hasLiveInPlaceAgent = existingSessions.some(
    (session) => session.noWorktree && (session.status === 'running' || session.status === 'waiting'),
  )
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
    && !session.groupId
  ))
  const inPlaceAgentRunning = hasLiveInPlaceAgent

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

  const submit = useCallback(
    async (modeOverride?: AgentMode): Promise<void> => {
      if (!canSubmit) return
      setError('')
      // A layout that launches straight from a "Start Chat" click passes the mode
      // in: reading it back from state here would see the pre-click value.
      const effectiveMode = modeOverride ?? mode
      if (modeOverride && modeOverride !== mode) setMode(modeOverride)
      // One in-place agent per repo: choosing a specific branch/PR here can't run
      // alongside the one already in place, and the backend would otherwise focus
      // the existing agent and silently ignore the selection. Surface it instead.
      if (isGitProject && hasLiveInPlaceAgent && useExisting) {
        setError('An in-place agent is already running in this repository. Only one can run at a time — open it from the sidebar, or close it before starting an agent on another branch or PR here.')
        return
      }
      const typedName = taskDescription.trim()
      const resolvedTaskDescription = typedName || pickRandomNorwegianCityName()
      setTaskDescription(resolvedTaskDescription)
      // No typed name → the resolved prompt is a placeholder (a random city used
      // only as a branch hint). For no-worktree agents, mark it so the backend
      // names the agent after its branch instead of showing the placeholder.
      const autoName = typedName.length === 0

      const launchOptions = (() => {
        if (!isGitProject) {
          return {
            projectId,
            runtimeId,
            prompt: resolvedTaskDescription,
            noWorktree: true,
            autoName,
          } satisfies SpawnAgentOptions
        }

        const base: SpawnAgentOptions = {
          projectId,
          runtimeId,
          prompt: resolvedTaskDescription,
          autoName,
        }

        // A selected branch becomes the agent's base branch (no worktree): with no
        // typed name the agent works directly on it, a typed name cuts a new branch
        // off it, and its diffs/PR compare against it. A PR still checks out the PR
        // branch. Empty picker + worktree off = base off the project's base branch.
        if (useExisting && existingSubTab === 'branch') {
          return { ...base, baseBranch: selectedBranch, noWorktree: true }
        }
        if (useExisting && existingSubTab === 'pr') {
          return { ...base, prIdentifier: String(selectedPr), noWorktree: true }
        }
        return { ...base, noWorktree: true }
      })()

      const finalOptions: SpawnAgentOptions = { ...launchOptions, nonInteractive: effectiveMode === 'chat' }

      // Persist the chosen mode and runtime so the next New Agent form (any repo)
      // defaults to them. Done at submit (not on every click) to avoid flooding all
      // renderers with settings:changed broadcasts while the user tries options out.
      const remembered: Partial<{ defaultAgentMode: AgentMode; defaultRuntime: string }> = {}
      if (effectiveMode !== defaultAgentMode) remembered.defaultAgentMode = effectiveMode
      if (runtimeId !== defaultRuntime) remembered.defaultRuntime = runtimeId
      if (Object.keys(remembered).length > 0) {
        window.electronAPI.invoke('settings:update', remembered).catch((err) => {
          console.error('[NewAgentForm] failed to persist agent defaults:', err)
        })
      }

      // Starting here switches the repo's real working copy to the base branch (no
      // typed name) or a new branch off it (typed name). Either way, if the tree is
      // dirty, confirm before carrying/clobbering the changes. (A PR checkout goes
      // through its own path and is not covered here.)
      const willSwitchInPlace = isGitProject && !(useExisting && existingSubTab === 'pr')
      if (willSwitchInPlace) {
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
    [useExisting, existingSubTab, projectId, runtimeId, taskDescription, selectedBranch, selectedPr, canSubmit, isGitProject, mode, defaultAgentMode, defaultRuntime, runLaunch, hasLiveInPlaceAgent]
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

  return {
    mode,
    setMode,
    taskDescription,
    setTaskDescription,
    runtimeId,
    setRuntimeId,
    runtimes,
    selectedRuntime,
    runtimeInstalled,
    useExisting,
    setUseExisting,
    existingSubTab,
    setExistingSubTab,
    branches,
    branchFilter,
    setBranchFilter,
    selectedBranch,
    setSelectedBranch,
    branchesLoading,
    prs,
    prFilter,
    setPrFilter,
    selectedPr,
    setSelectedPr,
    prsLoading,
    loading,
    error,
    canSubmit,
    reusableSessions,
    inPlaceAgentRunning,
    inputRef,
    submit,
    dirtyConfirmDialog,
  }
}
