import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { SpawnAgentOptions, AgentRuntime, BranchInfo, PRInfo } from '../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { TaskDescriptionField, AgentDropdown, BranchPicker, PRPicker } from './new-task'
import type { ExistingSubTab } from './new-task'

const LOGO = `  .--.      __  ___            _ ____      __    __
 / oo \\    /  |/  /___ _____  (_) __/___  / /___/ /
| \\__/ |  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 \\    /  / /  / / /_/ / / / / / __/ /_/ / / /_/ /
  \\__/  /_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

const buttonStyle: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent-text)',
  backgroundColor: 'var(--accent)',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-input)',
}

interface NoProjectProps {
  variant: 'no-project'
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
  onBack?: () => void
}

interface NoAgentProps {
  variant: 'no-agent'
  projectId: string
  projectName: string
  baseBranch: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => void
  focusTrigger?: number
}

type OnboardingViewProps = NoProjectProps | NoAgentProps

export function OnboardingView(props: OnboardingViewProps): React.JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        minHeight: 0,
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
    >
      <pre style={{ margin: 0, fontSize: 14, lineHeight: 1.3, color: 'var(--text-primary)', opacity: 0.6 }}>
        {LOGO}
      </pre>

      {props.variant === 'no-project' ? (
        <>
          <NoProjectActions
            onAddProject={props.onAddProject}
            onCloneProject={props.onCloneProject}
            onCreateNewProject={props.onCreateNewProject}
            creatingProject={props.creatingProject}
            cloningProject={props.cloningProject}
            createError={props.createError}
          />
          {props.onBack && (
            <button
              onClick={props.onBack}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                fontSize: 12,
                color: 'var(--text-muted)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Back to workspace
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            New agent for <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{props.projectName}</span>
          </div>
          <NewAgentForm
            projectId={props.projectId}
            baseBranch={props.baseBranch}
            defaultRuntime={props.defaultRuntime}
            onLaunch={props.onLaunch}
            focusTrigger={props.focusTrigger}
          />
        </>
      )}
    </div>
  )
}

function NewAgentForm({
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button
          type="submit"
          disabled={!canSubmit || loading}
          style={{ ...buttonStyle, opacity: canSubmit && !loading ? 1 : 0.5 }}
        >
          {loading ? 'Starting\u2026' : 'Start Agent \u2192'}
        </button>
      </div>
    </form>
  )
}

function NoProjectActions({
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  cloningProject,
  createError,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
}): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      const trimmed = description.trim()
      if (trimmed && !creatingProject) {
        onCreateNewProject(trimmed)
      }
    },
    [description, creatingProject, onCreateNewProject]
  )

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url && !cloningProject) {
        const success = await onCloneProject(url)
        if (success) {
          setCloneUrl('')
          setShowClone(false)
        }
      }
    },
    [cloneUrl, cloningProject, onCloneProject]
  )

  const canSubmit = description.trim().length > 0 && !creatingProject

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
        Start a new project
      </div>
      <form ref={formRef} onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 480, maxWidth: '90%' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project idea..."
            autoFocus
            rows={5}
            style={{
              width: '100%',
              padding: '10px 14px',
              paddingBottom: 44,
              fontSize: 13,
              lineHeight: 1.5,
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey && canSubmit) {
                e.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...buttonStyle,
              padding: '6px 16px',
              fontSize: 13,
              opacity: canSubmit ? 1 : 0.5,
              position: 'absolute',
              right: 8,
              bottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {creatingProject && <span className="spinner" />}
            {creatingProject ? 'Creating...' : 'Go'}
          </button>
        </div>
        {createError && !showClone && (
          <div style={{ fontSize: 12, color: 'var(--status-error, #f44)' }}>{createError}</div>
        )}
      </form>

      <div style={{
        width: 480,
        maxWidth: '90%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        margin: '8px 0',
      }}>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or open an existing repository</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={secondaryButtonStyle}>+ Add Local Repository</button>
        <button onClick={() => setShowClone((p) => !p)} style={secondaryButtonStyle}>Clone Repository</button>
      </div>
      {showClone && (
        <>
          <form onSubmit={(e) => void handleCloneSubmit(e)} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              autoFocus
              disabled={cloningProject}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                outline: 'none',
                width: 320,
                opacity: cloningProject ? 0.6 : 1,
              }}
            />
            <button
              type="submit"
              disabled={!cloneUrl.trim() || cloningProject}
              style={{ ...buttonStyle, opacity: !cloneUrl.trim() || cloningProject ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {cloningProject && <span className="spinner" />}
              {cloningProject ? 'Cloning...' : 'Clone'}
            </button>
          </form>
          {createError && showClone && (
            <div style={{ fontSize: 12, color: 'var(--status-error, #f44)', maxWidth: 480 }}>{createError}</div>
          )}
        </>
      )}
    </>
  )
}
