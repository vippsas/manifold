import React, { useCallback } from 'react'
import type { DensitySetting, SearchAiSettings } from '../../../../shared/types'
import { getThemeList } from '../../../../shared/themes/registry'
import { ThemePicker } from '../ThemePicker'
import { modalStyles } from '../SettingsModal.styles'
import { RUNTIME_OPTIONS } from './runtime-options'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
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
  shellPrompt: boolean
  onShellPromptChange: (enabled: boolean) => void
  uiMode: 'developer' | 'simple'
  onUiModeChange: (mode: 'developer' | 'simple') => void
  density: DensitySetting
  onDensityChange: (density: DensitySetting) => void
  autoGenerateMessages: boolean
  onAutoGenerateMessagesChange: (enabled: boolean) => void
  searchAiSettings: SearchAiSettings
}

export function GeneralSettingsSection(props: Props): React.JSX.Element {
  const handleScrollbackInput = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(event.target.value, 10)
    if (!Number.isNaN(value) && value > 0) props.onScrollbackChange(value)
  }, [props])

  const themeLabel = getThemeList().find((entry) => entry.id === props.theme)?.label ?? props.theme

  return (
    <>
      <SectionHeader
        title="General"
        description="Manage the defaults for new worktrees, the interface, and terminal behavior without cramming everything into one long form."
      />
      <div style={modalStyles.cardGrid}>
        <SectionCard title="Workspace" description="Defaults used when new sessions and branches are created.">
          <div style={modalStyles.fieldGrid}>
            <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Storage Directory
              <input type="text" value={props.storagePath} onChange={(event) => props.onStoragePathChange(event.target.value)} style={modalStyles.input} placeholder="~/.manifold" />
            </label>
            <label style={modalStyles.label}>
              Default Runtime
              <select value={props.defaultRuntime} onChange={(event) => props.onRuntimeChange(event.target.value)} style={modalStyles.select}>
                {RUNTIME_OPTIONS.map((runtime) => <option key={runtime.id} value={runtime.id}>{runtime.label}</option>)}
              </select>
            </label>
            <label style={modalStyles.label}>
              Default Base Branch
              <input type="text" value={props.defaultBaseBranch} onChange={(event) => props.onBaseBranchChange(event.target.value)} style={modalStyles.input} placeholder="main" />
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.autoGenerateMessages} onChange={(event) => props.onAutoGenerateMessagesChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Auto-generate AI messages for commits and PRs
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Appearance And Terminal" description="Theme, terminal defaults, and UI presentation.">
          <div style={modalStyles.fieldGrid}>
            <div style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Theme
              <div>
                <button type="button" onClick={() => props.onPickerToggle(!props.pickerOpen)} style={modalStyles.themeButton}>
                  {themeLabel}
                  <span aria-hidden="true">{props.pickerOpen ? 'Hide' : 'Browse'}</span>
                </button>
                {props.pickerOpen && (
                  <div style={modalStyles.pickerContainer}>
                    <ThemePicker
                      currentThemeId={props.theme}
                      onSelect={(id) => { props.onThemeChange(id); props.onPickerToggle(false) }}
                      onCancel={() => props.onPickerToggle(false)}
                      onPreview={props.onPreviewTheme}
                    />
                  </div>
                )}
              </div>
            </div>
            <label style={modalStyles.label}>
              Scrollback Lines
              <input type="number" value={props.scrollbackLines} onChange={handleScrollbackInput} min={100} max={100000} step={100} style={modalStyles.input} />
            </label>
            <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Terminal Font
              <input type="text" value={props.terminalFontFamily} onChange={(event) => props.onTerminalFontFamilyChange(event.target.value)} style={modalStyles.input} placeholder="SF Mono, Fira Code, Cascadia Code, Menlo" />
              <span style={modalStyles.helpText}>Set a Nerd Font (e.g. MesloLGS Nerd Font Mono) for oh-my-posh/Starship icons</span>
            </label>
            <label style={modalStyles.label}>
              UI Mode
              <select value={props.uiMode} onChange={(event) => props.onUiModeChange(event.target.value as 'developer' | 'simple')} style={modalStyles.select}>
                <option value="developer">Developer (Manifold)</option>
                <option value="simple">Simple</option>
              </select>
            </label>
            <label style={modalStyles.label}>
              Density
              <select value={props.density} onChange={(event) => props.onDensityChange(event.target.value as DensitySetting)} style={modalStyles.select}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.notificationSound} onChange={(event) => props.onNotificationSoundChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Play sound when agent stops running
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.shellPrompt} onChange={(event) => props.onShellPromptChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Use Manifold prompt in worktree shells
              <span style={modalStyles.helpText}>Shows a clean minimal prompt instead of your shell theme. Disable to keep your own prompt.</span>
            </label>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
