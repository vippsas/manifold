import React, { useCallback } from 'react'
import type { SearchAiSettings } from '../../../../shared/types'
import { getThemeList } from '../../../../shared/themes/registry'
import { ThemePicker } from '../ThemePicker'
import { modalStyles } from '../SettingsModal.styles'
import { SearchAiSettingsSection } from './SearchAiSettingsSection'
import { RUNTIME_OPTIONS } from './runtime-options'

type SettingsTabId = 'general' | 'search-ai'

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; description: string }> = [
  {
    id: 'general',
    label: 'General',
    description: 'Workspace defaults, appearance, and terminal behavior.',
  },
  {
    id: 'search-ai',
    label: 'Search AI',
    description: 'Answer mode, reranking, runtime, and retrieval limits.',
  },
]

interface SettingsModalBodyProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
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
  activeTab,
  onTabChange,
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
      <div style={modalStyles.settingsLayout}>
        <div style={modalStyles.tabBar} role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const tabId = `settings-tab-${tab.id}`
            const panelId = `settings-panel-${tab.id}`

            return (
              <button
                key={tab.id}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                style={{ ...modalStyles.tab, ...(isActive ? modalStyles.tabActive : {}) }}
                onClick={() => onTabChange(tab.id)}
              >
                <span style={modalStyles.tabTitle}>{tab.label}</span>
                <span style={modalStyles.tabDescription}>{tab.description}</span>
              </button>
            )
          })}
        </div>

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          style={modalStyles.tabPanel}
        >
          {activeTab === 'general' ? (
            <>
              <SectionHeader
                title="General"
                description="Manage the defaults for new worktrees, the interface, and terminal behavior without cramming everything into one long form."
              />
              <div style={modalStyles.cardGrid}>
                <SectionCard
                  title="Workspace"
                  description="Defaults used when new sessions and branches are created."
                >
                  <div style={modalStyles.fieldGrid}>
                    <StorageField value={storagePath} onChange={onStoragePathChange} fullWidth />
                    <RuntimeField value={defaultRuntime} onChange={onRuntimeChange} />
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
                </SectionCard>

                <SectionCard
                  title="Appearance And Terminal"
                  description="Theme, terminal defaults, and UI presentation."
                >
                  <div style={modalStyles.fieldGrid}>
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
                    <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
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
                    <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
                      <input
                        type="checkbox"
                        checked={notificationSound}
                        onChange={(e) => onNotificationSoundChange(e.target.checked)}
                        style={modalStyles.checkboxInput}
                      />
                      Play sound when agent stops running
                    </label>
                  </div>
                </SectionCard>
              </div>
            </>
          ) : (
            <>
              <SectionHeader
                title="Search AI"
                description="Configure when Ask AI answers directly, when it reranks exact results, and how much context is retrieved for each request."
              />
              <SectionCard
                title="Answering And Reranking"
                description="These settings affect the Search panel and Ask AI behavior."
              >
                <SearchAiSettingsSection
                  value={searchAiSettings}
                  onChange={onSearchAiSettingsChange}
                />
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }): React.JSX.Element {
  return (
    <div style={modalStyles.sectionHeader}>
      <div style={modalStyles.sectionHeading}>{title}</div>
      <div style={modalStyles.sectionDescription}>{description}</div>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description: string }>): React.JSX.Element {
  return (
    <section style={modalStyles.sectionCard}>
      <div style={modalStyles.cardHeader}>
        <div style={modalStyles.cardTitle}>{title}</div>
        <div style={modalStyles.cardDescription}>{description}</div>
      </div>
      {children}
    </section>
  )
}

function StorageField({
  value,
  onChange,
  fullWidth = false,
}: {
  value: string
  onChange: (v: string) => void
  fullWidth?: boolean
}): React.JSX.Element {
  return (
    <label style={fullWidth ? { ...modalStyles.label, ...modalStyles.fieldSpanFull } : modalStyles.label}>
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
    <div style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
      Theme
      <div>
        <button type="button" onClick={() => onPickerToggle(!pickerOpen)} style={modalStyles.themeButton}>
          {themeLabel}
          <span aria-hidden="true">{pickerOpen ? 'Hide' : 'Browse'}</span>
        </button>
        {pickerOpen && (
          <div style={modalStyles.pickerContainer}>
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
