import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions, AgentRuntime } from '../../../shared/types'
import { popoverStyles } from './NewAgentPopover.styles'

interface NewAgentPopoverProps {
  visible: boolean
  projectId: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => void
  onClose: () => void
}

export function NewAgentPopover({
  visible,
  projectId,
  defaultRuntime,
  onLaunch,
  onClose,
}: NewAgentPopoverProps): React.JSX.Element | null {
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [branchName, setBranchName] = useState('')
  const [loading, setLoading] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const overlayRef = useRef<HTMLDivElement>(null)

  useResetOnOpen(
    visible,
    projectId,
    defaultRuntime,
    setRuntimeId,
    setLoading,
    setBranchName,
    setOllamaModel,
    setOllamaModels
  )

  useEffect(() => {
    if (!visible) return
    window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [visible])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false
  const needsModelButNone = selectedRuntime?.needsModel && !ollamaModel

  useEffect(() => {
    if (!visible) return
    if (!selectedRuntime?.needsModel) {
      setOllamaModels([])
      setOllamaModel('')
      return
    }
    window.electronAPI.invoke('ollama:list-models').then((models) => {
      const modelList = models as string[]
      setOllamaModels(modelList)
      if (modelList.length > 0) {
        setOllamaModel(modelList[0])
      }
    })
  }, [visible, selectedRuntime?.needsModel])

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      setLoading(true)
      onLaunch({
        projectId,
        runtimeId,
        prompt: '',
        branchName: branchName.trim() || undefined,
        ollamaModel: selectedRuntime?.needsModel ? ollamaModel : undefined,
      })
    },
    [projectId, runtimeId, branchName, ollamaModel, selectedRuntime?.needsModel, onLaunch]
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
      style={popoverStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="New Agent"
    >
      <form onSubmit={handleSubmit} style={popoverStyles.panel}>
        <PopoverHeader onClose={onClose} />
        <PopoverBody
          runtimeId={runtimeId}
          branchName={branchName}
          runtimes={runtimes}
          runtimeInstalled={runtimeInstalled}
          selectedRuntime={selectedRuntime}
          onRuntimeChange={setRuntimeId}
          onBranchChange={setBranchName}
          ollamaModels={ollamaModels}
          ollamaModel={ollamaModel}
          onModelChange={setOllamaModel}
          needsModel={!!selectedRuntime?.needsModel}
        />
        <PopoverFooter
          onClose={onClose}
          canSubmit={runtimeInstalled && !needsModelButNone}
          loading={loading}
        />
      </form>
    </div>
  )
}

function useResetOnOpen(
  visible: boolean,
  projectId: string,
  defaultRuntime: string,
  setRuntimeId: (id: string) => void,
  setLoading: (val: boolean) => void,
  setBranchName: (val: string) => void,
  setOllamaModel: (val: string) => void,
  setOllamaModels: (val: string[]) => void
): void {
  useEffect(() => {
    if (!visible) return
    setRuntimeId(defaultRuntime)
    setLoading(false)
    setOllamaModel('')
    setOllamaModels([])

    const fetchBranchSuggestion = async (): Promise<void> => {
      try {
        const suggested = (await window.electronAPI.invoke('branch:suggest', projectId)) as string
        setBranchName(suggested)
      } catch {
        setBranchName('manifold/oslo')
      }
    }

    void fetchBranchSuggestion()
  }, [
    visible,
    projectId,
    defaultRuntime,
    setRuntimeId,
    setLoading,
    setBranchName,
    setOllamaModel,
    setOllamaModels,
  ])
}

function PopoverHeader({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div style={popoverStyles.header}>
      <span style={popoverStyles.title}>Launch Agent</span>
      <button type="button" onClick={onClose} style={popoverStyles.closeButton}>
        &times;
      </button>
    </div>
  )
}

interface PopoverBodyProps {
  runtimeId: string
  branchName: string
  runtimes: AgentRuntime[]
  runtimeInstalled: boolean
  selectedRuntime: AgentRuntime | undefined
  onRuntimeChange: (id: string) => void
  onBranchChange: (name: string) => void
  ollamaModels: string[]
  ollamaModel: string
  onModelChange: (model: string) => void
  needsModel: boolean
}

function PopoverBody({
  runtimeId,
  branchName,
  runtimes,
  runtimeInstalled,
  selectedRuntime,
  onRuntimeChange,
  onBranchChange,
  ollamaModels,
  ollamaModel,
  onModelChange,
  needsModel,
}: PopoverBodyProps): React.JSX.Element {
  return (
    <div style={popoverStyles.body}>
      <label style={popoverStyles.label}>
        Runtime
        <select
          value={runtimeId}
          onChange={(e) => onRuntimeChange(e.target.value)}
          style={popoverStyles.select}
        >
          {runtimes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}{rt.installed === false ? ' (not installed)' : ''}
            </option>
          ))}
        </select>
        {!runtimeInstalled && (
          <p style={{ color: 'var(--error, #f85149)', fontSize: '12px', margin: 0 }}>
            {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
          </p>
        )}
      </label>
      {needsModel && (
        <label style={popoverStyles.label}>
          Model
          <select
            value={ollamaModel}
            onChange={(e) => onModelChange(e.target.value)}
            style={popoverStyles.select}
          >
            {ollamaModels.length === 0 && (
              <option value="">No models found</option>
            )}
            {ollamaModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {ollamaModels.length === 0 && (
            <p style={{ color: 'var(--error, #f85149)', fontSize: '12px', margin: 0 }}>
              No Ollama models found. Run &quot;ollama pull &lt;model&gt;&quot; to download one.
            </p>
          )}
        </label>
      )}
      <label style={popoverStyles.label}>
        Branch
        <input
          type="text"
          value={branchName}
          onChange={(e) => onBranchChange(e.target.value)}
          style={popoverStyles.input}
          placeholder="manifold/oslo"
        />
      </label>
    </div>
  )
}

function PopoverFooter({
  onClose,
  canSubmit,
  loading,
}: {
  onClose: () => void
  canSubmit: boolean
  loading: boolean
}): React.JSX.Element {
  return (
    <div style={popoverStyles.footer}>
      <button type="button" onClick={onClose} style={popoverStyles.cancelButton}>
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit || loading}
        style={{
          ...popoverStyles.launchButton,
          opacity: !canSubmit || loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Launching...' : 'Launch'}
      </button>
    </div>
  )
}

