import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { SpawnAgentOptions, AgentRuntime, BranchInfo, PRInfo } from '../../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField, AgentDropdown, BranchPicker, PRPicker } from '../new-task'
import type { ExistingSubTab } from '../new-task'

export function NewAgentForm({
  projectId,
  baseBranch,
  defaultRuntime,
  onLaunch,
  focusTrigger,
}: {
  projectId: string
  baseBranch: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => void
  focusTrigger?: number
}): React.JSX.Element {
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
  const [noWorktree, setNoWorktree] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusTrigger])

  useEffect(() => {
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [])

  useEffect(() => {
    if (!useExisting || existingSubTab !== 'branch') return
    setBranchesLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-branches', projectId)
      .then((list) => setBranches(list as BranchInfo[]))
      .catch((err) => setError(`Failed to load branches: ${(err as Error).message}`))
      .finally(() => setBranchesLoading(false))
  }, [useExisting, existingSubTab, projectId])

  useEffect(() => {
    if (!useExisting || existingSubTab !== 'pr') return
    setPrsLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-prs', projectId)
      .then((list) => setPrs(list as PRInfo[]))
      .catch((err) => setError(`Failed to load PRs: ${(err as Error).message}`))
      .finally(() => setPrsLoading(false))
  }, [useExisting, existingSubTab, projectId])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false

  const canSubmit = (() => {
    if (!runtimeInstalled) return false
    if (taskDescription.trim().length === 0) return false
    if (useExisting && existingSubTab === 'branch' && !selectedBranch) return false
    if (useExisting && existingSubTab === 'pr' && selectedPr === null) return false
    return true
  })()

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (!canSubmit) return
      setLoading(true)
      setError('')

      const base: SpawnAgentOptions = {
        projectId,
        runtimeId,
        prompt: taskDescription.trim(),
        noWorktree: noWorktree || undefined,
      }

      if (useExisting && existingSubTab === 'branch') {
        onLaunch({ ...base, existingBranch: selectedBranch })
      } else if (useExisting && existingSubTab === 'pr') {
        onLaunch({ ...base, prIdentifier: String(selectedPr) })
      } else {
        onLaunch(base)
      }
    },
    [useExisting, existingSubTab, projectId, runtimeId, taskDescription, selectedBranch, selectedPr, canSubmit, onLaunch, noWorktree]
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 420, maxWidth: '90%' }}>
      <TaskDescriptionField
        value={taskDescription}
        onChange={setTaskDescription}
        inputRef={inputRef}
        canSubmit={canSubmit}
        loading={loading}
      />

      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        style={modalStyles.advancedToggle}
      >
        <span style={{ transform: showAdvanced ? 'rotate(90deg)' : undefined, display: 'inline-block', transition: 'transform 0.15s' }}>&#9654;</span>
        {' '}Advanced
      </button>

      {showAdvanced && (
        <>
          <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
          {!runtimeInstalled && (
            <p style={modalStyles.errorText}>
              {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
            </p>
          )}

          <label style={modalStyles.checkboxLabel}>
            <input type="checkbox" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} />
            Continue on an existing branch or PR
          </label>

          <label style={modalStyles.checkboxLabel}>
            <input type="checkbox" checked={noWorktree} onChange={(e) => setNoWorktree(e.target.checked)} />
            No worktree (run in repository directory)
          </label>
          {noWorktree && !useExisting && (
            <p style={modalStyles.infoText}>
              A new branch will be created from the current branch in your repository directory.
            </p>
          )}

          {useExisting && (
            <>
              <div style={modalStyles.subTabBar}>
                <button type="button" onClick={() => setExistingSubTab('branch')} style={{ ...modalStyles.subTab, ...(existingSubTab === 'branch' ? modalStyles.subTabActive : {}) }}>
                  Branch
                </button>
                <button type="button" onClick={() => setExistingSubTab('pr')} style={{ ...modalStyles.subTab, ...(existingSubTab === 'pr' ? modalStyles.subTabActive : {}) }}>
                  Pull Request
                </button>
              </div>

              {existingSubTab === 'branch' && (
                <BranchPicker branches={branches} baseBranch={baseBranch} filter={branchFilter} onFilterChange={setBranchFilter} selected={selectedBranch} onSelect={setSelectedBranch} loading={branchesLoading} allowBaseBranch={noWorktree} />
              )}

              {existingSubTab === 'pr' && (
                <PRPicker prs={prs} filter={prFilter} onFilterChange={setPrFilter} selected={selectedPr} onSelect={setSelectedPr} loading={prsLoading} />
              )}
            </>
          )}
        </>
      )}

      {error && <p style={modalStyles.errorText}>{error}</p>}
    </form>
  )
}
