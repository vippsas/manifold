import React, { useCallback } from 'react'
import type { SearchAiSettings } from '../../../../shared/types'
import { getThemeList } from '../../../../shared/themes/registry'
import { ThemePicker } from '../ThemePicker'
import { modalStyles } from '../SettingsModal.styles'
import { SearchAiSettingsSection } from './SearchAiSettingsSection'
import { RUNTIME_OPTIONS } from './runtime-options'

interface SettingsModalBodyProps {
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
  searchAiSettings: SearchAiSettings
  onSearchAiSettingsChange: (value: SearchAiSettings) => void
}

export function SettingsModalBody({
  storagePath,
  onStoragePathChange,
  defaultRuntime,
  theme,
  scrollbackLines,
  terminalFontFamily,
  defaultBaseBranch,
  onRuntimeChange,
  onThemeChange,
  onScrollbackChange,
  onTerminalFontFamilyChange,
  onBaseBranchChange,
  onPreviewTheme,
  pickerOpen,
  onPickerToggle,
  notificationSound,
  onNotificationSoundChange,
  uiMode,
  onUiModeChange,
  searchAiSettings,
  onSearchAiSettingsChange,
}: SettingsModalBodyProps): React.JSX.Element {
  const handleScrollbackInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = parseInt(e.target.value, 10)
      if (!isNaN(value) && value > 0) onScrollbackChange(value)
    },
    [onScrollbackChange],
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
        Terminal Font
        <input
          type="text"
          value={terminalFontFamily}
          onChange={(e) => onTerminalFontFamilyChange(e.target.value)}
          style={modalStyles.input}
          placeholder="SF Mono, Fira Code, Cascadia Code, Menlo"
        />
        <span style={modalStyles.helpText}>
          Set a Nerd Font (e.g. MesloLGS Nerd Font Mono) for oh-my-posh/Starship icons
        </span>
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
          <option value="simple">Simple</option>
        </select>
      </label>

      <div style={modalStyles.divider} />
      <div style={modalStyles.sectionTitle}>Search AI</div>
      <SearchAiSettingsSection
        value={searchAiSettings}
        onChange={onSearchAiSettingsChange}
      />
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
  themeLabel,
  theme,
  pickerOpen,
  onPickerToggle,
  onThemeChange,
  onPreviewTheme,
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
      <div style={{ position: 'relative' }}>
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
