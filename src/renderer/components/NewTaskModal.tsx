import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions, AgentRuntime, Project, BranchInfo, PRInfo } from '../../shared/types'
import { deriveBranchName } from '../../shared/derive-branch-name'
import { modalStyles } from './NewTaskModal.styles'

type ModalTab = 'new' | 'existing'
type ExistingSubTab = 'branch' | 'pr'

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
        </div>
        <ModalFooter onClose={onClose} canSubmit={canSubmit} loading={loading} />
      </form>
    </div>
  )
}

function useResetOnOpen(
  visible: boolean,
  defaultRuntime: string,
  setTaskDescription: (v: string) => void,
  setRuntimeId: (v: string) => void,
  setBranchName: (v: string) => void,
  setBranchEdited: (v: boolean) => void,
  setShowAdvanced: (v: boolean) => void,
  setLoading: (v: boolean) => void,
  setActiveTab: (v: ModalTab) => void,
  setExistingSubTab: (v: ExistingSubTab) => void,
  setBranches: (v: BranchInfo[]) => void,
  setBranchFilter: (v: string) => void,
  setSelectedBranch: (v: string) => void,
  setPrs: (v: PRInfo[]) => void,
  setPrFilter: (v: string) => void,
  setSelectedPr: (v: number | null) => void,
  setError: (v: string) => void
): void {
  useEffect(() => {
    if (!visible) return
    setTaskDescription('')
    setRuntimeId(defaultRuntime)
    setBranchName('')
    setBranchEdited(false)
    setShowAdvanced(false)
    setLoading(false)
    setActiveTab('new')
    setExistingSubTab('branch')
    setBranches([])
    setBranchFilter('')
    setSelectedBranch('')
    setPrs([])
    setPrFilter('')
    setSelectedPr(null)
    setError('')
  }, [visible, defaultRuntime, setTaskDescription, setRuntimeId, setBranchName, setBranchEdited, setShowAdvanced, setLoading, setActiveTab, setExistingSubTab, setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError])
}

function useDebouncedBranchDerivation(
  taskDescription: string,
  branchEdited: boolean,
  setBranchName: (v: string) => void,
  projectName: string
): void {
  useEffect(() => {
    if (branchEdited) return

    const timer = setTimeout(() => {
      setBranchName(deriveBranchName(taskDescription, projectName))
    }, 300)

    return () => clearTimeout(timer)
  }, [taskDescription, branchEdited, setBranchName, projectName])
}

function useAutoFocus(visible: boolean, ref: React.RefObject<HTMLTextAreaElement | null>): void {
  useEffect(() => {
    if (visible) {
      // Small delay to ensure DOM is ready after modal mount
      const timer = setTimeout(() => ref.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [visible, ref])
}

function ModalHeader({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div style={modalStyles.header}>
      <span style={modalStyles.title}>New Task</span>
      <button type="button" onClick={onClose} style={modalStyles.closeButton} aria-label="Close">
        &times;
      </button>
    </div>
  )
}

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ModalTab
  onTabChange: (tab: ModalTab) => void
}): React.JSX.Element {
  return (
    <div style={modalStyles.tabBar}>
      <button
        type="button"
        onClick={() => onTabChange('new')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'new' ? modalStyles.tabActive : {}),
        }}
      >
        New Branch
      </button>
      <button
        type="button"
        onClick={() => onTabChange('existing')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'existing' ? modalStyles.tabActive : {}),
        }}
      >
        Existing Branch / PR
      </button>
    </div>
  )
}

function TaskDescriptionField({
  value,
  onChange,
  textareaRef,
}: {
  value: string
  onChange: (v: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={modalStyles.label}>
        What do you want to work on?
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={modalStyles.textarea}
          rows={3}
        />
      </label>
      <p style={modalStyles.hint}>
        Describe what you want the agent to work on — used for branch naming and tracking
      </p>
    </div>
  )
}

function ProjectDropdown({
  value,
  onChange,
  projects,
}: {
  value: string
  onChange: (v: string) => void
  projects: Project[]
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Project
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function AgentDropdown({
  value,
  onChange,
  runtimes,
}: {
  value: string
  onChange: (v: string) => void
  runtimes: AgentRuntime[]
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Agent
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {runtimes.map((rt) => (
          <option key={rt.id} value={rt.id}>
            {rt.name}{rt.installed === false ? ' (not installed)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function AdvancedSection({
  show,
  onToggle,
  branchName,
  onBranchChange,
  projectName,
}: {
  show: boolean
  onToggle: () => void
  branchName: string
  onBranchChange: (v: string) => void
  projectName: string
}): React.JSX.Element {
  return (
    <div>
      <button type="button" onClick={onToggle} style={modalStyles.advancedToggle}>
        <span style={{ transform: show ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>
          {'\u25B8'}
        </span>
        Advanced
      </button>
      {show && (
        <div style={{ marginTop: '8px' }}>
          <label style={modalStyles.label}>
            Branch
            <input
              type="text"
              value={branchName}
              onChange={(e) => onBranchChange(e.target.value)}
              style={modalStyles.input}
              placeholder={`${projectName.toLowerCase()}/...`}
            />
          </label>
        </div>
      )}
    </div>
  )
}

function BranchPicker({
  branches,
  baseBranch,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
}: {
  branches: BranchInfo[]
  baseBranch: string
  filter: string
  onFilterChange: (v: string) => void
  selected: string
  onSelect: (v: string) => void
  loading: boolean
}): React.JSX.Element {
  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  )
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <label style={modalStyles.label}>
      Branch
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={loading ? 'Loading branches...' : 'Filter branches...'}
        style={modalStyles.input}
      />
      {!loading && (
        <div
          ref={listRef}
          style={{
            marginTop: '4px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-input)',
            maxHeight: '192px',
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {filtered.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {filter ? 'No matching branches' : 'No branches found'}
            </div>
          )}
          {filtered.map((b) => {
            const isBase = b.name === baseBranch
            const isSelected = b.name === selected
            return (
              <div
                key={b.name}
                role="option"
                aria-selected={isSelected}
                onClick={isBase ? undefined : () => onSelect(b.name)}
                style={{
                  padding: '4px 8px',
                  fontSize: '13px',
                  cursor: isBase ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isBase
                    ? 'var(--text-muted)'
                    : isSelected
                      ? 'var(--accent-text)'
                      : 'var(--text-primary)',
                  opacity: isBase ? 0.6 : 1,
                }}
              >
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>
                  {b.name}
                  {isBase ? ' (default — new tasks branch from here)' : ''}
                </span>
                {b.source !== 'both' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'inherit',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontWeight: 500,
                      background: b.source === 'remote'
                        ? 'rgba(56, 139, 253, 0.15)'
                        : 'rgba(210, 153, 34, 0.15)',
                      color: b.source === 'remote'
                        ? 'rgb(100, 170, 255)'
                        : 'rgb(210, 167, 62)',
                    }}
                  >
                    {b.source}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </label>
  )
}

function PRPicker({
  prs,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
}: {
  prs: PRInfo[]
  filter: string
  onFilterChange: (v: string) => void
  selected: number | null
  onSelect: (v: number | null) => void
  loading: boolean
}): React.JSX.Element {
  const lowerFilter = filter.toLowerCase()
  const filtered = prs.filter(
    (pr) =>
      pr.title.toLowerCase().includes(lowerFilter) ||
      pr.headRefName.toLowerCase().includes(lowerFilter) ||
      String(pr.number).includes(filter) ||
      pr.author.toLowerCase().includes(lowerFilter)
  )
  return (
    <label style={modalStyles.label}>
      Pull Request
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={loading ? 'Loading PRs...' : 'Filter pull requests...'}
        style={modalStyles.input}
      />
      {!loading && (
        <div
          style={{
            marginTop: '4px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-input)',
            maxHeight: '192px',
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {filtered.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {filter ? 'No matching pull requests' : 'No open pull requests'}
            </div>
          )}
          {filtered.map((pr) => {
            const isSelected = pr.number === selected
            return (
              <div
                key={pr.number}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(pr.number)}
                style={{
                  padding: '5px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? 'var(--accent-text)' : 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '11px',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    #{pr.number}
                  </span>
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {pr.title}
                  </span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  display: 'flex',
                  gap: '8px',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{pr.headRefName}</span>
                  <span>{pr.author}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </label>
  )
}

function ModalFooter({
  onClose,
  canSubmit,
  loading,
}: {
  onClose: () => void
  canSubmit: boolean
  loading: boolean
}): React.JSX.Element {
  return (
    <div style={modalStyles.footer}>
      <button type="button" onClick={onClose} style={modalStyles.cancelButton}>
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit || loading}
        style={{
          ...modalStyles.startButton,
          opacity: !canSubmit || loading ? 0.5 : 1,
          cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Starting\u2026' : 'Start Task \u2192'}
      </button>
    </div>
  )
}
