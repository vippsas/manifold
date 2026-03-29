import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { SpawnAgentOptions, AgentRuntime, BranchInfo, PRInfo } from '../../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField, AgentDropdown, BranchPicker, PRPicker } from '../new-task'
import type { ExistingSubTab } from '../new-task'
import { pickRandomNorwegianCityName } from '../../../shared/norwegian-cities'

type BranchMode = 'current' | 'new'

const segmentedStyles = {
  container: {
    display: 'flex',
    gap: 0,
    background: 'var(--bg-input, rgba(255,255,255,0.03))',
    borderRadius: 'var(--radius-md)',
    padding: 3,
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  button: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px 24px',
    border: 'none',
    borderRadius: 'calc(var(--radius-md) - 2px)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 500,
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--text-muted)',
    transition: 'all var(--duration-normal) var(--ease-premium)',
  } as React.CSSProperties,
  buttonActive: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
  } as React.CSSProperties,
}

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
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  focusTrigger?: number
}): React.JSX.Element {
  const [branchMode, setBranchMode] = useState<BranchMode>('new')
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
  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
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
    if (branchMode !== 'new' || !useExisting || existingSubTab !== 'branch') return
    setBranchesLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-branches', projectId)
      .then((list) => setBranches(list as BranchInfo[]))
      .catch((err) => setError(`Failed to load branches: ${(err as Error).message}`))
      .finally(() => setBranchesLoading(false))
  }, [branchMode, useExisting, existingSubTab, projectId])

  useEffect(() => {
    if (branchMode !== 'new' || !useExisting || existingSubTab !== 'pr') return
    setPrsLoading(true)
    setError('')
    void window.electronAPI
      .invoke('git:list-prs', projectId)
      .then((list) => setPrs(list as PRInfo[]))
      .catch((err) => setError(`Failed to load PRs: ${(err as Error).message}`))
      .finally(() => setPrsLoading(false))
  }, [branchMode, useExisting, existingSubTab, projectId])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false

  const canSubmit = (() => {
    if (!runtimeInstalled) return false
    if (branchMode === 'new' && useExisting && existingSubTab === 'branch' && !selectedBranch) return false
    if (branchMode === 'new' && useExisting && existingSubTab === 'pr' && selectedPr === null) return false
    return true
  })()

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      if (!canSubmit) return
      setLoading(true)
      setError('')
      const resolvedTaskDescription = taskDescription.trim() || pickRandomNorwegianCityName()
      setTaskDescription(resolvedTaskDescription)

      const launchOptions = (() => {
        if (branchMode === 'current') {
          return {
            projectId,
            runtimeId,
            prompt: resolvedTaskDescription,
            noWorktree: true,
            stayOnBranch: true,
          } satisfies SpawnAgentOptions
        }

        const base: SpawnAgentOptions = {
          projectId,
          runtimeId,
          prompt: resolvedTaskDescription,
        }

        if (useExisting && existingSubTab === 'branch') {
          return { ...base, existingBranch: selectedBranch }
        }
        if (useExisting && existingSubTab === 'pr') {
          return { ...base, prIdentifier: String(selectedPr) }
        }
        return base
      })()

      try {
        const session = await onLaunch(launchOptions)
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
    [branchMode, useExisting, existingSubTab, projectId, runtimeId, taskDescription, selectedBranch, selectedPr, canSubmit, onLaunch]
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 420, maxWidth: '90%' }}>
      <div style={segmentedStyles.container}>
        <button
          type="button"
          onClick={() => setBranchMode('new')}
          style={{ ...segmentedStyles.button, ...(branchMode === 'new' ? segmentedStyles.buttonActive : {}) }}
        >
          New branch
        </button>
        <button
          type="button"
          onClick={() => setBranchMode('current')}
          style={{ ...segmentedStyles.button, ...(branchMode === 'current' ? segmentedStyles.buttonActive : {}) }}
        >
          Current branch
        </button>
      </div>

      {branchMode === 'current' && (
        <p style={modalStyles.infoText}>
          The agent will work directly on your current branch.
        </p>
      )}

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

          {branchMode === 'new' && (
            <>
              <label style={modalStyles.checkboxLabel}>
                <input type="checkbox" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} />
                Continue on an existing branch or PR
              </label>

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
                    <BranchPicker branches={branches} baseBranch={baseBranch} filter={branchFilter} onFilterChange={setBranchFilter} selected={selectedBranch} onSelect={setSelectedBranch} loading={branchesLoading} />
                  )}

                  {existingSubTab === 'pr' && (
                    <PRPicker prs={prs} filter={prFilter} onFilterChange={setPrFilter} selected={selectedPr} onSelect={setSelectedPr} loading={prsLoading} />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {error && <p style={modalStyles.errorText}>{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit || loading}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'var(--control-height)',
          padding: '0 32px',
          background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
          color: 'var(--btn-text)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--type-ui)',
          fontWeight: 500,
          cursor: canSubmit && !loading ? 'pointer' : 'default',
          letterSpacing: '0.02em',
          boxShadow: 'var(--shadow-glow, var(--shadow-subtle))',
          transition: 'filter var(--duration-normal) var(--ease-premium)',
          marginTop: 'var(--space-sm)',
          opacity: canSubmit && !loading ? 1 : 0.5,
        }}
      >
        {loading ? 'Starting…' : 'Start Agent'}
      </button>
    </form>
  )
}
