import React from 'react'
import type { ProvisionerConfig, ProvisionerStatus } from '../../../../shared/provisioning-types'
import type { SearchAiSettings, EditorSettings, ShellPromptSegments } from '../../../../shared/types'
import type { AiServiceSettings } from '../../../../shared/plugins/api-types'
import { modalStyles } from '../SettingsModal.styles'
import { SearchAiSettingsSection } from './SearchAiSettingsSection'
import { GeneralSettingsSection } from './GeneralSettingsSection'
import { EditorSettingsSection } from './EditorSettingsSection'
import { ProvisioningSettingsSection } from './ProvisioningSettingsSection'
import { TranscriptionSettingsSection } from './TranscriptionSettingsSection'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'
import { PluginSettingsSection } from './PluginSettingsSection'
import { ShortcutsSettingsSection } from './ShortcutsSettingsSection'

export type SettingsTabId = 'general' | 'editor' | 'shortcuts' | 'search-ai' | 'provisioning' | 'transcription' | 'plugins'

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'search-ai', label: 'Search AI' },
  { id: 'provisioning', label: 'Provisioning' },
  { id: 'transcription', label: 'Transcription' },
  { id: 'plugins', label: 'Plugins' },
]

interface Props {
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
  searchAiSettings: SearchAiSettings
  onSearchAiSettingsChange: (value: SearchAiSettings) => void
  editorSettings: EditorSettings
  onEditorSettingsChange: (value: EditorSettings) => void
  provisioners: ProvisionerConfig[]
  provisionerStatuses: ProvisionerStatus[]
  onProvisionersChange: (value: ProvisionerConfig[]) => void
  onCheckProvisionerHealth: (provisionerId?: string) => Promise<void>
  onRefreshProvisionerCatalog: (provisionerId?: string) => Promise<void>
  transcription: AiServiceSettings
  onTranscriptionChange: (value: AiServiceSettings) => void
}

export function SettingsModalBody(props: Props): React.JSX.Element {
  return (
    <div style={modalStyles.body}>
      <div style={modalStyles.settingsLayout}>
        <nav style={modalStyles.sidebar} role="tablist" aria-label="Settings sections" aria-orientation="vertical">
          {SETTINGS_TABS.map((tab) => {
            const isActive = props.activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                style={{ ...modalStyles.navItem, ...(isActive ? modalStyles.navItemActive : {}) }}
                onMouseEnter={(event) => { if (!isActive) event.currentTarget.style.background = 'var(--list-hover-bg)' }}
                onMouseLeave={(event) => { if (!isActive) event.currentTarget.style.background = 'transparent' }}
                onClick={() => props.onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div id={`settings-panel-${props.activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${props.activeTab}`} style={modalStyles.tabPanel}>
          {props.activeTab === 'general' && <GeneralSettingsSection {...props} />}
          {props.activeTab === 'editor' && (
            <EditorSettingsSection value={props.editorSettings} onChange={props.onEditorSettingsChange} />
          )}
          {props.activeTab === 'shortcuts' && <ShortcutsSettingsSection />}
          {props.activeTab === 'search-ai' && (
            <>
              <SectionHeader title="Search AI" description="Configure when Ask AI answers directly, when it reranks exact results, and how much context is retrieved for each request." />
              <SectionCard title="Answering And Reranking" description="These settings affect the Search panel and Ask AI behavior.">
                <SearchAiSettingsSection value={props.searchAiSettings} onChange={props.onSearchAiSettingsChange} />
              </SectionCard>
            </>
          )}
          {props.activeTab === 'provisioning' && (
            <ProvisioningSettingsSection
              provisioners={props.provisioners}
              statuses={props.provisionerStatuses}
              onChange={props.onProvisionersChange}
              onCheckHealth={props.onCheckProvisionerHealth}
              onRefreshCatalog={props.onRefreshProvisionerCatalog}
            />
          )}
          {props.activeTab === 'transcription' && (
            <TranscriptionSettingsSection value={props.transcription} onChange={props.onTranscriptionChange} />
          )}
          {props.activeTab === 'plugins' && <PluginSettingsSection />}
        </div>
      </div>
    </div>
  )
}
