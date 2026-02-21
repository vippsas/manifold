import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SpawnAgentOptions } from '../../shared/types'
import { deriveBranchName } from '../../shared/derive-branch-name'
import { modalStyles } from './NewTaskModal.styles'

interface NewTaskModalProps {
  visible: boolean
  projectId: string
  defaultRuntime: string
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

export function NewTaskModal({
  visible,
  projectId,
  defaultRuntime,
  onLaunch,
  onClose,
}: NewTaskModalProps): React.JSX.Element | null {
  const [taskDescription, setTaskDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [branchName, setBranchName] = useState('')
  const [branchEdited, setBranchEdited] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useResetOnOpen(visible, defaultRuntime, setTaskDescription, setRuntimeId, setBranchName, setBranchEdited, setShowAdvanced, setLoading)
  useDebouncedBranchDerivation(taskDescription, branchEdited, setBranchName)
  useAutoFocus(visible, textareaRef)

  const canSubmit = taskDescription.trim().length > 0

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (!canSubmit) return
      setLoading(true)
      onLaunch({
        projectId,
        runtimeId,
        prompt: taskDescription.trim(),
        branchName: branchName.trim() || undefined,
      })
    },
    [projectId, runtimeId, taskDescription, branchName, canSubmit, onLaunch]
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
        <div style={modalStyles.body}>
          <TaskDescriptionField
            value={taskDescription}
            onChange={setTaskDescription}
            textareaRef={textareaRef}
          />
          <AgentDropdown value={runtimeId} onChange={setRuntimeId} />
          <AdvancedSection
            show={showAdvanced}
            onToggle={() => setShowAdvanced((p) => !p)}
            branchName={branchName}
            onBranchChange={handleBranchChange}
          />
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
  setLoading: (v: boolean) => void
): void {
  useEffect(() => {
    if (!visible) return
    setTaskDescription('')
    setRuntimeId(defaultRuntime)
    setBranchName('')
    setBranchEdited(false)
    setShowAdvanced(false)
    setLoading(false)
  }, [visible, defaultRuntime, setTaskDescription, setRuntimeId, setBranchName, setBranchEdited, setShowAdvanced, setLoading])
}

function useDebouncedBranchDerivation(
  taskDescription: string,
  branchEdited: boolean,
  setBranchName: (v: string) => void
): void {
  useEffect(() => {
    if (branchEdited) return

    const timer = setTimeout(() => {
      setBranchName(deriveBranchName(taskDescription))
    }, 300)

    return () => clearTimeout(timer)
  }, [taskDescription, branchEdited, setBranchName])
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

function AgentDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Agent
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {RUNTIMES.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.label}</option>
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
}: {
  show: boolean
  onToggle: () => void
  branchName: string
  onBranchChange: (v: string) => void
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
              placeholder="manifold/..."
            />
          </label>
        </div>
      )}
    </div>
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
