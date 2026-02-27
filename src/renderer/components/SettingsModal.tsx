import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ManifoldSettings } from '../../shared/types'
import { getThemeList } from '../../shared/themes/registry'
import { ThemePicker } from './ThemePicker'
import { modalStyles } from './SettingsModal.styles'

interface SettingsModalProps {
  visible: boolean
  settings: ManifoldSettings
  onSave: (partial: Partial<ManifoldSettings>) => void
  onClose: () => void
  onPreviewTheme?: (themeId: string | null) => void
}

interface RuntimeOption {
  id: string
  label: string
}

const RUNTIME_OPTIONS: RuntimeOption[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
]

export function SettingsModal({
  visible, settings, onSave, onClose, onPreviewTheme,
}: SettingsModalProps): React.JSX.Element | null {
  const [defaultRuntime, setDefaultRuntime] = useState(settings.defaultRuntime)
  const [theme, setTheme] = useState(settings.theme)
  const [scrollbackLines, setScrollbackLines] = useState(settings.scrollbackLines)
  const [terminalFontFamily, setTerminalFontFamily] = useState(settings.terminalFontFamily)
  const [defaultBaseBranch, setDefaultBaseBranch] = useState(settings.defaultBaseBranch)
  const [storagePath, setStoragePath] = useState(settings.storagePath)
  const [notificationSound, setNotificationSound] = useState(settings.notificationSound)
  const [uiMode, setUiMode] = useState(settings.uiMode)
  const [pickerOpen, setPickerOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) {
      setDefaultRuntime(settings.defaultRuntime)
      setTheme(settings.theme)
      setScrollbackLines(settings.scrollbackLines)
      setTerminalFontFamily(settings.terminalFontFamily)
      setDefaultBaseBranch(settings.defaultBaseBranch)
      setStoragePath(settings.storagePath)
      setNotificationSound(settings.notificationSound)
      setUiMode(settings.uiMode)
      setPickerOpen(false)
    }
  }, [visible, settings])

  const handleSave = useCallback((): void => {
    const modeChanged = uiMode !== settings.uiMode
    onSave({ defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, uiMode })
    onClose()
    if (modeChanged) {
      window.electronAPI.invoke('app:switch-mode', uiMode)
    }
  }, [defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, uiMode, settings.uiMode, onSave, onClose])

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
      style={{
        ...modalStyles.overlay,
        background: pickerOpen ? 'transparent' : 'rgba(0, 0, 0, 0.5)',
        pointerEvents: pickerOpen ? 'none' : 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div style={{ ...modalStyles.panel, pointerEvents: 'auto' }}>
        <ModalHeader onClose={onClose} />
        <SettingsBody
          storagePath={storagePath}
          onStoragePathChange={setStoragePath}
          defaultRuntime={defaultRuntime}
          theme={theme}
          scrollbackLines={scrollbackLines}
          terminalFontFamily={terminalFontFamily}
          defaultBaseBranch={defaultBaseBranch}
          onRuntimeChange={setDefaultRuntime}
          onThemeChange={setTheme}
          onScrollbackChange={setScrollbackLines}
          onTerminalFontFamilyChange={setTerminalFontFamily}
          onBaseBranchChange={setDefaultBaseBranch}
          onPreviewTheme={onPreviewTheme}
          pickerOpen={pickerOpen}
          onPickerToggle={setPickerOpen}
          notificationSound={notificationSound}
          onNotificationSoundChange={setNotificationSound}
          uiMode={uiMode}
          onUiModeChange={setUiMode}
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
      <button onClick={onClose} style={modalStyles.closeButton}>&times;</button>
    </div>
  )
}

interface SettingsBodyProps {
  storagePath: string
  onStoragePathChange: (path: string) => void
  defaultRuntime: string
  theme: string
  scrollbackLines: number
  terminalFontFamily: string
  defaultBaseBranch: string
  onRuntimeChange: (id: string) => void
  onThemeChange: (theme: string) => void
  onScrollbackChange: (lines: number) => void
  onTerminalFontFamilyChange: (font: string) => void
  onBaseBranchChange: (branch: string) => void
  onPreviewTheme?: (themeId: string | null) => void
  pickerOpen: boolean
  onPickerToggle: (open: boolean) => void
  notificationSound: boolean
  onNotificationSoundChange: (enabled: boolean) => void
  uiMode: 'developer' | 'simple'
  onUiModeChange: (mode: 'developer' | 'simple') => void
}

function SettingsBody({
  storagePath, onStoragePathChange,
  defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch,
  onRuntimeChange, onThemeChange, onScrollbackChange, onTerminalFontFamilyChange, onBaseBranchChange,
  onPreviewTheme, pickerOpen, onPickerToggle,
  notificationSound, onNotificationSoundChange,
  uiMode, onUiModeChange,
}: SettingsBodyProps): React.JSX.Element {
  const handleScrollbackInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = parseInt(e.target.value, 10)
      if (!isNaN(value) && value > 0) onScrollbackChange(value)
    },
    [onScrollbackChange]
  )

  const themeLabel = getThemeList().find((t) => t.id === theme)?.label ?? theme

  return (
    <div style={modalStyles.body}>
      <StorageField value={storagePath} onChange={onStoragePathChange} />
      <RuntimeField value={defaultRuntime} onChange={onRuntimeChange} />
      <ThemeField
        themeLabel={themeLabel}
        theme={theme}
        pickerOpen={pickerOpen}
        onPickerToggle={onPickerToggle}
        onThemeChange={onThemeChange}
        onPreviewTheme={onPreviewTheme}
      />
      <label style={modalStyles.label}>
        Scrollback Lines
        <input
          type="number" value={scrollbackLines} onChange={handleScrollbackInput}
          min={100} max={100000} step={100} style={modalStyles.input}
        />
      </label>
      <label style={modalStyles.label}>
        Terminal Font
        <input
          type="text" value={terminalFontFamily}
          onChange={(e) => onTerminalFontFamilyChange(e.target.value)}
          style={modalStyles.input}
          placeholder="SF Mono, Fira Code, Cascadia Code, Menlo"
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Set a Nerd Font (e.g. MesloLGS Nerd Font Mono) for oh-my-posh/Starship icons
        </span>
      </label>
      <label style={modalStyles.label}>
        Default Base Branch
        <input
          type="text" value={defaultBaseBranch}
          onChange={(e) => onBaseBranchChange(e.target.value)}
          style={modalStyles.input} placeholder="main"
        />
      </label>
      <label style={{ ...modalStyles.label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={notificationSound}
          onChange={(e) => onNotificationSoundChange(e.target.checked)}
          style={{ width: 'auto', margin: 0 }}
        />
        Play sound when agent stops running
      </label>
      <label style={modalStyles.label}>
        UI Mode
        <select
          value={uiMode}
          onChange={(e) => onUiModeChange(e.target.value as 'developer' | 'simple')}
          style={modalStyles.select}
        >
          <option value="developer">Developer (Manifold)</option>
          <option value="simple">Simple (Manible)</option>
        </select>
      </label>
    </div>
  )
}

function StorageField({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Storage Directory
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={modalStyles.input} placeholder="~/.manifold" />
    </label>
  )
}

function RuntimeField({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Default Runtime
      <select value={value} onChange={(e) => onChange(e.target.value)} style={modalStyles.select}>
        {RUNTIME_OPTIONS.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.label}</option>
        ))}
      </select>
    </label>
  )
}

function ThemeField({
  themeLabel, theme, pickerOpen, onPickerToggle, onThemeChange, onPreviewTheme,
}: {
  themeLabel: string
  theme: string
  pickerOpen: boolean
  onPickerToggle: (open: boolean) => void
  onThemeChange: (theme: string) => void
  onPreviewTheme?: (themeId: string | null) => void
}): React.JSX.Element {
  return (
    <div style={modalStyles.label}>
      Theme
      <div style={{ position: 'relative' as const }}>
        <button onClick={() => onPickerToggle(!pickerOpen)} style={modalStyles.themeButton}>
          {themeLabel}
        </button>
        {pickerOpen && (
          <div style={modalStyles.pickerOverlay}>
            <ThemePicker
              currentThemeId={theme}
              onSelect={(id) => { onThemeChange(id); onPickerToggle(false) }}
              onCancel={() => onPickerToggle(false)}
              onPreview={onPreviewTheme}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave }: { onClose: () => void; onSave: () => void }): React.JSX.Element {
  return (
    <div style={modalStyles.footer}>
      <button onClick={onClose} style={modalStyles.cancelButton}>Cancel</button>
      <button onClick={onSave} style={modalStyles.saveButton}>Save</button>
    </div>
  )
}
