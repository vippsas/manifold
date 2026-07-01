import React, { useCallback } from 'react'
import type { SearchAiSettings, ShellPromptSegments } from '../../../../shared/types'
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
  shellHistoryScope: 'project' | 'global'
  onShellHistoryScopeChange: (scope: 'project' | 'global') => void
  shellPromptSegments: ShellPromptSegments
  onShellPromptSegmentsChange: (segments: ShellPromptSegments) => void
  autoGenerateMessages: boolean
  onAutoGenerateMessagesChange: (enabled: boolean) => void
  showCommitAndPrButtons: boolean
  onShowCommitAndPrButtonsChange: (enabled: boolean) => void
  sidebarResizeReversed: boolean
  onSidebarResizeReversedChange: (enabled: boolean) => void
  useWorktrees: boolean
  onUseWorktreesChange: (enabled: boolean) => void
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
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.showCommitAndPrButtons} onChange={(event) => props.onShowCommitAndPrButtonsChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Show Commit and Create PR buttons in the status bar
              <span style={modalStyles.helpText}>Reveals the quick-action buttons that open the commit and PR panels from the status bar.</span>
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.useWorktrees} onChange={(event) => props.onUseWorktreesChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Create an isolated git worktree for each new agent
              <span style={modalStyles.helpText}>When off, new agents run directly in the repository on a new branch. Only one in-place agent can safely run per repo at a time.</span>
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
              Shell History
              <select value={props.shellHistoryScope} onChange={(event) => props.onShellHistoryScopeChange(event.target.value as 'project' | 'global')} style={modalStyles.select}>
                <option value="project">Per Project</option>
                <option value="global">Global</option>
              </select>
              <span style={modalStyles.helpText}>Per Project keeps history separate for each repository. Global shares history across all projects.</span>
            </label>
            <div style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Manifold Prompt Segments
              {([
                ['repo', 'Repository name'],
                ['agent', 'Agent name'],
                ['k8sContext', 'Kubernetes context'],
                ['k8sNamespace', 'Kubernetes namespace'],
              ] as const).map(([key, label]) => (
                <label key={key} style={modalStyles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={props.shellPromptSegments[key]}
                    onChange={(event) => props.onShellPromptSegmentsChange({ ...props.shellPromptSegments, [key]: event.target.checked })}
                    style={modalStyles.checkboxInput}
                  />
                  {label}
                </label>
              ))}
              <span style={modalStyles.helpText}>Applies to new Manifold-prompt shells. Kubernetes segments read kubectl and stay hidden when no context is active.</span>
            </div>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.sidebarResizeReversed} onChange={(event) => props.onSidebarResizeReversedChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Reverse sidebar resize direction
              <span style={modalStyles.helpText}>Double-clicking a sidebar handle jumps to the widest size first, then steps narrower (1/6 → 3/6 → 2/6). Default grows wider one step at a time. Neither direction collapses the sidebar — use the collapse button for that.</span>
            </label>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
