import React, { useState, useEffect, useCallback, useRef } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { ProvisionerConfig, ProvisionerStatus } from '../../../shared/provisioning-types'
import type { ManifoldSettings } from '../../../shared/types'
import { modalStyles } from './SettingsModal.styles'
import { SettingsModalBody, type SettingsTabId } from './settings/SettingsModalBody'
import { validateProvisioners } from './settings/provisioning-settings-helpers'

interface SettingsModalProps {
  visible: boolean
  settings: ManifoldSettings
  onSave: (partial: Partial<ManifoldSettings>) => void
  onClose: () => void
  onPreviewTheme?: (themeId: string | null) => void
}

export function SettingsModal({ visible, settings, onSave, onClose, onPreviewTheme }: SettingsModalProps): React.JSX.Element | null {
  const [defaultRuntime, setDefaultRuntime] = useState(settings.defaultRuntime)
  const [theme, setTheme] = useState(settings.theme)
  const [scrollbackLines, setScrollbackLines] = useState(settings.scrollbackLines)
  const [terminalFontFamily, setTerminalFontFamily] = useState(settings.terminalFontFamily)
  const [defaultBaseBranch, setDefaultBaseBranch] = useState(settings.defaultBaseBranch)
  const [storagePath, setStoragePath] = useState(settings.storagePath)
  const [notificationSound, setNotificationSound] = useState(settings.notificationSound)
  const [uiMode, setUiMode] = useState(settings.uiMode)
  const [searchAiSettings, setSearchAiSettings] = useState(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
  const [provisioners, setProvisioners] = useState<ProvisionerConfig[]>(settings.provisioning?.provisioners ?? DEFAULT_SETTINGS.provisioning.provisioners)
  const [provisionerStatuses, setProvisionerStatuses] = useState<ProvisionerStatus[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  const overlayRef = useRef<HTMLDivElement>(null)

  const loadProvisionerStatuses = useCallback(async (nextProvisioners: ProvisionerConfig[]): Promise<void> => {
    const statuses = (await window.electronAPI.invoke('provisioning:get-statuses', nextProvisioners)) as ProvisionerStatus[]
    setProvisionerStatuses(statuses)
  }, [])

  useEffect(() => {
    if (!visible) return
    const nextProvisioners = settings.provisioning?.provisioners ?? DEFAULT_SETTINGS.provisioning.provisioners
    setDefaultRuntime(settings.defaultRuntime)
    setTheme(settings.theme)
    setScrollbackLines(settings.scrollbackLines)
    setTerminalFontFamily(settings.terminalFontFamily)
    setDefaultBaseBranch(settings.defaultBaseBranch)
    setStoragePath(settings.storagePath)
    setNotificationSound(settings.notificationSound)
    setUiMode(settings.uiMode)
    setSearchAiSettings(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
    setProvisioners(nextProvisioners)
    setPickerOpen(false)
    setActiveTab('general')
    void loadProvisionerStatuses(nextProvisioners)
  }, [visible, settings, loadProvisionerStatuses])

  const handleSave = useCallback((): void => {
    const validation = validateProvisioners(provisioners)
    const hasErrors = Object.values(validation).some((errors) => errors.length > 0)
    if (hasErrors) {
      setActiveTab('provisioning')
      return
    }

    const modeChanged = uiMode !== settings.uiMode
    onSave({
      defaultRuntime,
      theme,
      scrollbackLines,
      terminalFontFamily,
      defaultBaseBranch,
      storagePath,
      notificationSound,
      uiMode,
      search: { ai: searchAiSettings },
      provisioning: { provisioners },
    })
    onClose()
    if (modeChanged) {
      window.electronAPI.invoke('app:switch-mode', uiMode)
    }
  }, [defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, uiMode, settings.uiMode, searchAiSettings, provisioners, onSave, onClose])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={(event) => { if (event.target === overlayRef.current) onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
      style={modalStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div style={modalStyles.panel}>
        <div style={modalStyles.header}>
          <span style={modalStyles.title}>Settings</span>
          <button type="button" onClick={onClose} style={modalStyles.closeButton} aria-label="Close settings">&times;</button>
        </div>

        <SettingsModalBody
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setPickerOpen(false) }}
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
          searchAiSettings={searchAiSettings}
          onSearchAiSettingsChange={setSearchAiSettings}
          provisioners={provisioners}
          provisionerStatuses={provisionerStatuses}
          onProvisionersChange={setProvisioners}
          onCheckProvisionerHealth={async (provisionerId?: string) => {
            const statuses = (await window.electronAPI.invoke('provisioning:check-health', provisionerId, provisioners)) as ProvisionerStatus[]
            setProvisionerStatuses((current) => mergeStatuses(current, statuses))
          }}
          onRefreshProvisionerCatalog={async (provisionerId?: string) => {
            const catalog = (await window.electronAPI.invoke('provisioning:refresh-templates', provisionerId, provisioners)) as { provisioners: ProvisionerStatus[] }
            setProvisionerStatuses((current) => mergeStatuses(current, catalog.provisioners))
          }}
        />

        <div style={modalStyles.footer}>
          <button type="button" onClick={onClose} style={modalStyles.cancelButton}>Cancel</button>
          <button type="button" onClick={handleSave} style={modalStyles.saveButton}>Save</button>
        </div>
      </div>
    </div>
  )
}

function mergeStatuses(current: ProvisionerStatus[], next: ProvisionerStatus[]): ProvisionerStatus[] {
  const map = new Map(current.map((status) => [status.provisionerId, status]))
  for (const status of next) map.set(status.provisionerId, status)
  return Array.from(map.values()).sort((left, right) => left.provisionerLabel.localeCompare(right.provisionerLabel))
}
