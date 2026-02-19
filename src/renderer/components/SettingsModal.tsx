import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ManifoldSettings } from '../../shared/types'

interface SettingsModalProps {
  visible: boolean
  settings: ManifoldSettings
  onSave: (partial: Partial<ManifoldSettings>) => void
  onClose: () => void
}

interface RuntimeOption {
  id: string
  label: string
}

const RUNTIME_OPTIONS: RuntimeOption[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'custom', label: 'Custom' },
]

export function SettingsModal({
  visible,
  settings,
  onSave,
  onClose,
}: SettingsModalProps): React.JSX.Element | null {
  const [defaultRuntime, setDefaultRuntime] = useState(settings.defaultRuntime)
  const [theme, setTheme] = useState(settings.theme)
  const [scrollbackLines, setScrollbackLines] = useState(settings.scrollbackLines)
  const [defaultBaseBranch, setDefaultBaseBranch] = useState(settings.defaultBaseBranch)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) {
      setDefaultRuntime(settings.defaultRuntime)
      setTheme(settings.theme)
      setScrollbackLines(settings.scrollbackLines)
      setDefaultBaseBranch(settings.defaultBaseBranch)
    }
  }, [visible, settings])

  const handleSave = useCallback((): void => {
    onSave({ defaultRuntime, theme, scrollbackLines, defaultBaseBranch })
    onClose()
  }, [defaultRuntime, theme, scrollbackLines, defaultBaseBranch, onSave, onClose])

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
      aria-label="Settings"
    >
      <div style={modalStyles.panel}>
        <ModalHeader onClose={onClose} />
        <SettingsBody
          defaultRuntime={defaultRuntime}
          theme={theme}
          scrollbackLines={scrollbackLines}
          defaultBaseBranch={defaultBaseBranch}
          onRuntimeChange={setDefaultRuntime}
          onThemeChange={setTheme}
          onScrollbackChange={setScrollbackLines}
          onBaseBranchChange={setDefaultBaseBranch}
        />
        <ModalFooter onClose={onClose} onSave={handleSave} />
      </div>
    </div>
  )
}

function ModalHeader({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div style={modalStyles.header}>
      <span style={modalStyles.title}>Settings</span>
      <button onClick={onClose} style={modalStyles.closeButton}>
        &times;
      </button>
    </div>
  )
}

interface SettingsBodyProps {
  defaultRuntime: string
  theme: 'dark' | 'light'
  scrollbackLines: number
  defaultBaseBranch: string
  onRuntimeChange: (id: string) => void
  onThemeChange: (theme: 'dark' | 'light') => void
  onScrollbackChange: (lines: number) => void
  onBaseBranchChange: (branch: string) => void
}

function SettingsBody({
  defaultRuntime,
  theme,
  scrollbackLines,
  defaultBaseBranch,
  onRuntimeChange,
  onThemeChange,
  onScrollbackChange,
  onBaseBranchChange,
}: SettingsBodyProps): React.JSX.Element {
  const handleScrollbackInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = parseInt(e.target.value, 10)
      if (!isNaN(value) && value > 0) onScrollbackChange(value)
    },
    [onScrollbackChange]
  )

  const handleThemeSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const value = e.target.value
      if (value === 'dark' || value === 'light') onThemeChange(value)
    },
    [onThemeChange]
  )

  return (
    <div style={modalStyles.body}>
      <label style={modalStyles.label}>
        Default Runtime
        <select
          value={defaultRuntime}
          onChange={(e) => onRuntimeChange(e.target.value)}
          style={modalStyles.select}
        >
          {RUNTIME_OPTIONS.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.label}</option>
          ))}
        </select>
      </label>
      <label style={modalStyles.label}>
        Theme
        <select value={theme} onChange={handleThemeSelect} style={modalStyles.select}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label style={modalStyles.label}>
        Scrollback Lines
        <input
          type="number"
          value={scrollbackLines}
          onChange={handleScrollbackInput}
          min={100}
          max={100000}
          step={100}
          style={modalStyles.input}
        />
      </label>
      <label style={modalStyles.label}>
        Default Base Branch
        <input
          type="text"
          value={defaultBaseBranch}
          onChange={(e) => onBaseBranchChange(e.target.value)}
          style={modalStyles.input}
          placeholder="main"
        />
      </label>
    </div>
  )
}

function ModalFooter({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: () => void
}): React.JSX.Element {
  return (
    <div style={modalStyles.footer}>
      <button onClick={onClose} style={modalStyles.cancelButton}>
        Cancel
      </button>
      <button onClick={onSave} style={modalStyles.saveButton}>
        Save
      </button>
    </div>
  )
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '380px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
  },
  closeButton: {
    fontSize: '18px',
    color: 'var(--text-secondary)',
    padding: '0 4px',
    lineHeight: 1,
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  select: {
    padding: '6px 8px',
    fontSize: '13px',
  },
  input: {
    padding: '6px 8px',
    fontSize: '13px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  cancelButton: {
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
  },
  saveButton: {
    padding: '6px 20px',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#ffffff',
    background: 'var(--accent)',
    fontWeight: 500,
  },
}
