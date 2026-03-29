import React from 'react'
import type { ProvisionerConfig, ProvisionerStatus } from '../../../../shared/provisioning-types'
import type { SearchAiSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SearchAiSettingsSection } from './SearchAiSettingsSection'
import { GeneralSettingsSection } from './GeneralSettingsSection'
import { ProvisioningSettingsSection } from './ProvisioningSettingsSection'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

export type SettingsTabId = 'general' | 'search-ai' | 'provisioning'

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; description: string }> = [
  { id: 'general', label: 'General', description: 'Workspace defaults, appearance, and terminal behavior.' },
  { id: 'search-ai', label: 'Search AI', description: 'Answer mode, reranking, runtime, and retrieval limits.' },
  { id: 'provisioning', label: 'Provisioning', description: 'Provisioner configuration, health checks, and template catalogs.' },
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
  shellPrompt: boolean
  onShellPromptChange: (enabled: boolean) => void
  uiMode: 'developer' | 'simple'
  onUiModeChange: (mode: 'developer' | 'simple') => void
  searchAiSettings: SearchAiSettings
  onSearchAiSettingsChange: (value: SearchAiSettings) => void
  provisioners: ProvisionerConfig[]
  provisionerStatuses: ProvisionerStatus[]
  onProvisionersChange: (value: ProvisionerConfig[]) => void
  onCheckProvisionerHealth: (provisionerId?: string) => Promise<void>
  onRefreshProvisionerCatalog: (provisionerId?: string) => Promise<void>
}

export function SettingsModalBody(props: Props): React.JSX.Element {
  return (
    <div style={modalStyles.body}>
      <div style={modalStyles.settingsLayout}>
        <div style={modalStyles.tabBar} role="tablist" aria-label="Settings sections">
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
                style={{ ...modalStyles.tab, ...(isActive ? modalStyles.tabActive : {}) }}
                onClick={() => props.onTabChange(tab.id)}
              >
                <span style={modalStyles.tabTitle}>{tab.label}</span>
                <span style={modalStyles.tabDescription}>{tab.description}</span>
              </button>
            )
          })}
        </div>

        <div id={`settings-panel-${props.activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${props.activeTab}`} style={modalStyles.tabPanel}>
          {props.activeTab === 'general' && <GeneralSettingsSection {...props} />}
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
        </div>
      </div>
    </div>
  )
}
