import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions } from '../../shared/types'
import { popoverStyles } from './NewAgentPopover.styles'

interface NewAgentPopoverProps {
  visible: boolean
  projectId: string
  onLaunch: (options: SpawnAgentOptions) => void
  onClose: () => void
}

interface RuntimeOption {
  id: string
  label: string
}

const RUNTIMES: RuntimeOption[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'custom', label: 'Custom' },
]

export function NewAgentPopover({
  visible,
  projectId,
  onLaunch,
  onClose,
}: NewAgentPopoverProps): React.JSX.Element | null {
  const [runtimeId, setRuntimeId] = useState(RUNTIMES[0].id)
  const [branchName, setBranchName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useResetOnOpen(visible, projectId, setRuntimeId, setPrompt, setLoading, setBranchName)

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (!prompt.trim()) return
      setLoading(true)
      onLaunch({
        projectId,
        runtimeId,
        prompt: prompt.trim(),
        branchName: branchName.trim() || undefined,
      })
    },
    [projectId, runtimeId, prompt, branchName, onLaunch]
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
          prompt={prompt}
          onRuntimeChange={setRuntimeId}
          onBranchChange={setBranchName}
          onPromptChange={setPrompt}
        />
        <PopoverFooter onClose={onClose} canSubmit={!!prompt.trim()} loading={loading} />
      </form>
    </div>
  )
}

function useResetOnOpen(
  visible: boolean,
  projectId: string,
  setRuntimeId: (id: string) => void,
  setPrompt: (val: string) => void,
  setLoading: (val: boolean) => void,
  setBranchName: (val: string) => void
): void {
  useEffect(() => {
    if (!visible) return
    setRuntimeId(RUNTIMES[0].id)
    setPrompt('')
    setLoading(false)

    const fetchBranchSuggestion = async (): Promise<void> => {
      try {
        const suggested = (await window.electronAPI.invoke('branch:suggest', projectId)) as string
        setBranchName(suggested)
      } catch {
        setBranchName('manifold/oslo')
      }
    }

    void fetchBranchSuggestion()
  }, [visible, projectId, setRuntimeId, setPrompt, setLoading, setBranchName])
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
  prompt: string
  onRuntimeChange: (id: string) => void
  onBranchChange: (name: string) => void
  onPromptChange: (text: string) => void
}

function PopoverBody({
  runtimeId,
  branchName,
  prompt,
  onRuntimeChange,
  onBranchChange,
  onPromptChange,
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
          {RUNTIMES.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.label}</option>
          ))}
        </select>
      </label>
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
      <label style={popoverStyles.label}>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          style={popoverStyles.textarea}
          placeholder="Describe the task for the agent..."
          rows={4}
          autoFocus
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

