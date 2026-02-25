import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions, AgentRuntime, Project, BranchInfo, PRInfo } from '../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { useResetOnOpen } from '../hooks/useResetOnOpen'
import { useAutoFocus } from '../hooks/useAutoFocus'
import {
  ModalHeader,
  TaskDescriptionField,
  ProjectDropdown,
  AgentDropdown,
  BranchPicker,
  PRPicker,
  ModalFooter,
} from './new-task'
import type { ExistingSubTab } from './new-task'

interface NewTaskModalProps {
  visible: boolean
  projectId: string
  baseBranch: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => void
  onClose: () => void
  /** When provided, show a project selector (center button case) */
  projects?: Project[]
  /** Pre-populated task description from the inline input */
  initialDescription?: string
}

export function NewTaskModal({
  visible,
  projectId,
  baseBranch,
  defaultRuntime,
  onLaunch,
  onClose,
  projects,
  initialDescription = '',
}: NewTaskModalProps): React.JSX.Element | null {
  const [taskDescription, setTaskDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [loading, setLoading] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectId)
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
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showProjectSelector = projects != null && projects.length > 1
  const effectiveProjectId = showProjectSelector ? selectedProjectId : projectId
  const selectedProject = showProjectSelector
    ? projects.find((p) => p.id === selectedProjectId)
    : undefined
  const effectiveBaseBranch = selectedProject?.baseBranch ?? baseBranch

  useEffect(() => {
    if (visible) setSelectedProjectId(projectId)
  }, [visible, projectId])

  useResetOnOpen(
    visible, defaultRuntime, initialDescription,
    setTaskDescription, setRuntimeId, setLoading, setUseExisting, setExistingSubTab,
    setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError,
    setNoWorktree
  )
  useAutoFocus(visible, inputRef)

  useEffect(() => {
    if (!visible) return
    window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [visible])

  // Fetch branches when existing + branch sub-tab is active
  useEffect(() => {
    if (!visible || !useExisting || existingSubTab !== 'branch') return
    setBranchesLoading(true)
    setError('')
    window.electronAPI
      .invoke('git:list-branches', effectiveProjectId)
      .then((list) => {
        setBranches(list as BranchInfo[])
      })
      .catch((err) => {
        setError(`Failed to load branches: ${(err as Error).message}`)
      })
      .finally(() => setBranchesLoading(false))
  }, [visible, useExisting, existingSubTab, effectiveProjectId])

  // Fetch open PRs when existing + PR sub-tab is active
  useEffect(() => {
    if (!visible || !useExisting || existingSubTab !== 'pr') return
    setPrsLoading(true)
    setError('')
    window.electronAPI
      .invoke('git:list-prs', effectiveProjectId)
      .then((list) => {
        setPrs(list as PRInfo[])
      })
      .catch((err) => {
        setError(`Failed to load PRs: ${(err as Error).message}`)
      })
      .finally(() => setPrsLoading(false))
  }, [visible, useExisting, existingSubTab, effectiveProjectId])

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

      if (useExisting && existingSubTab === 'branch') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          existingBranch: selectedBranch,
          noWorktree: noWorktree || undefined,
        })
      } else if (useExisting && existingSubTab === 'pr') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          prIdentifier: String(selectedPr),
          noWorktree: noWorktree || undefined,
        })
      } else {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          noWorktree: noWorktree || undefined,
        })
      }
    },
    [useExisting, existingSubTab, effectiveProjectId, runtimeId, taskDescription, selectedBranch, selectedPr, canSubmit, onLaunch, noWorktree]
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={modalStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="New Agent"
    >
      <form onSubmit={handleSubmit} style={modalStyles.panel}>
        <ModalHeader onClose={onClose} />
        <div style={modalStyles.body}>
          {showProjectSelector && (
            <ProjectDropdown
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              projects={projects}
            />
          )}
          <TaskDescriptionField
            value={taskDescription}
            onChange={setTaskDescription}
            inputRef={inputRef}
          />
          <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
          {!runtimeInstalled && (
            <p style={modalStyles.errorText}>
              {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
            </p>
          )}

          <label style={modalStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={useExisting}
              onChange={(e) => setUseExisting(e.target.checked)}
            />
            Continue on an existing branch or PR
          </label>

          <label style={modalStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={noWorktree}
              onChange={(e) => setNoWorktree(e.target.checked)}
            />
            No worktree (run in project directory)
          </label>
          {noWorktree && !useExisting && (
            <p style={modalStyles.infoText}>
              A new branch will be created from the current branch in your project directory.
            </p>
          )}

          {useExisting && (
            <>
              <div style={modalStyles.subTabBar}>
                <button
                  type="button"
                  onClick={() => setExistingSubTab('branch')}
                  style={{
                    ...modalStyles.subTab,
                    ...(existingSubTab === 'branch' ? modalStyles.subTabActive : {}),
                  }}
                >
                  Branch
                </button>
                <button
                  type="button"
                  onClick={() => setExistingSubTab('pr')}
                  style={{
                    ...modalStyles.subTab,
                    ...(existingSubTab === 'pr' ? modalStyles.subTabActive : {}),
                  }}
                >
                  Pull Request
                </button>
              </div>

              {existingSubTab === 'branch' && (
                <BranchPicker
                  branches={branches}
                  baseBranch={effectiveBaseBranch}
                  filter={branchFilter}
                  onFilterChange={setBranchFilter}
                  selected={selectedBranch}
                  onSelect={setSelectedBranch}
                  loading={branchesLoading}
                  allowBaseBranch={noWorktree}
                />
              )}

              {existingSubTab === 'pr' && (
                <PRPicker
                  prs={prs}
                  filter={prFilter}
                  onFilterChange={setPrFilter}
                  selected={selectedPr}
                  onSelect={setSelectedPr}
                  loading={prsLoading}
                />
              )}
            </>
          )}

          {error && <p style={modalStyles.errorText}>{error}</p>}
        </div>
        <ModalFooter onClose={onClose} canSubmit={canSubmit} loading={loading} />
      </form>
    </div>
  )
}
