import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions, AgentRuntime, Project, BranchInfo, PRInfo } from '../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { useResetOnOpen } from '../hooks/useResetOnOpen'
import { useDebouncedBranchDerivation } from '../hooks/useDebouncedBranchDerivation'
import { useAutoFocus } from '../hooks/useAutoFocus'
import {
  ModalHeader,
  TabBar,
  TaskDescriptionField,
  ProjectDropdown,
  AgentDropdown,
  AdvancedSection,
  BranchPicker,
  PRPicker,
  ModalFooter,
  WorktreeHint,
} from './new-task'
import type { ModalTab, ExistingSubTab } from './new-task'

interface NewTaskModalProps {
  visible: boolean
  projectId: string
  projectName: string
  baseBranch: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => void
  onClose: () => void
  /** When provided, show a project selector (center button case) */
  projects?: Project[]
}

export function NewTaskModal({
  visible,
  projectId,
  projectName,
  baseBranch,
  defaultRuntime,
  onLaunch,
  onClose,
  projects,
}: NewTaskModalProps): React.JSX.Element | null {
  const [taskDescription, setTaskDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [branchName, setBranchName] = useState('')
  const [branchEdited, setBranchEdited] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectId)
  const [activeTab, setActiveTab] = useState<ModalTab>('new')
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
  const overlayRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showProjectSelector = projects != null && projects.length > 1
  const effectiveProjectId = showProjectSelector ? selectedProjectId : projectId
  const selectedProject = showProjectSelector
    ? projects.find((p) => p.id === selectedProjectId)
    : undefined
  const effectiveProjectName = selectedProject?.name ?? projectName
  const effectiveBaseBranch = selectedProject?.baseBranch ?? baseBranch

  useEffect(() => {
    if (visible) setSelectedProjectId(projectId)
  }, [visible, projectId])

  useResetOnOpen(
    visible, defaultRuntime,
    setTaskDescription, setRuntimeId, setBranchName, setBranchEdited,
    setShowAdvanced, setLoading, setActiveTab, setExistingSubTab,
    setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError
  )
  useDebouncedBranchDerivation(taskDescription, branchEdited, setBranchName, effectiveProjectName)
  useAutoFocus(visible, textareaRef)

  useEffect(() => {
    if (!visible) return
    window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [visible])

  // Fetch branches when switching to existing/branch tab
  useEffect(() => {
    if (!visible || activeTab !== 'existing' || existingSubTab !== 'branch') return
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
  }, [visible, activeTab, existingSubTab, effectiveProjectId])

  // Fetch open PRs when switching to existing/pr tab
  useEffect(() => {
    if (!visible || activeTab !== 'existing' || existingSubTab !== 'pr') return
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
  }, [visible, activeTab, existingSubTab, effectiveProjectId])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false

  const canSubmit = (() => {
    if (!runtimeInstalled) return false
    if (taskDescription.trim().length === 0) return false
    if (activeTab === 'existing' && existingSubTab === 'branch' && !selectedBranch) return false
    if (activeTab === 'existing' && existingSubTab === 'pr' && selectedPr === null) return false
    return true
  })()

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (!canSubmit) return
      setLoading(true)
      setError('')

      if (activeTab === 'existing' && existingSubTab === 'branch') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          existingBranch: selectedBranch,
        })
      } else if (activeTab === 'existing' && existingSubTab === 'pr') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          prIdentifier: String(selectedPr),
        })
      } else {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          branchName: branchName.trim() || undefined,
        })
      }
    },
    [activeTab, existingSubTab, effectiveProjectId, runtimeId, taskDescription, branchName, selectedBranch, selectedPr, canSubmit, onLaunch]
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

  const handleBranchChange = useCallback((value: string): void => {
    setBranchEdited(true)
    setBranchName(value)
  }, [])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={modalStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="New Task"
    >
      <form onSubmit={handleSubmit} style={modalStyles.panel}>
        <ModalHeader onClose={onClose} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
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
            textareaRef={textareaRef}
          />
          <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
          {!runtimeInstalled && (
            <p style={modalStyles.errorText}>
              {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
            </p>
          )}

          {activeTab === 'new' && (
            <AdvancedSection
              show={showAdvanced}
              onToggle={() => setShowAdvanced((p) => !p)}
              branchName={branchName}
              onBranchChange={handleBranchChange}
              projectName={effectiveProjectName}
            />
          )}

          {activeTab === 'existing' && (
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

          <WorktreeHint
            activeTab={activeTab}
            existingSubTab={existingSubTab}
            baseBranch={effectiveBaseBranch}
            selectedBranch={selectedBranch}
            selectedPr={selectedPr}
            prs={prs}
          />
        </div>
        <ModalFooter onClose={onClose} canSubmit={canSubmit} loading={loading} />
      </form>
    </div>
  )
}
