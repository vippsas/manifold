import React, { useState, useEffect, useCallback, useRef } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { ManifoldSettings } from '../../../shared/types'
import { modalStyles } from './SettingsModal.styles'
import { SettingsModalBody } from './settings/SettingsModalBody'

interface SettingsModalProps {
  visible: boolean
  settings: ManifoldSettings
  onSave: (partial: Partial<ManifoldSettings>) => void
  onClose: () => void
  onPreviewTheme?: (themeId: string | null) => void
}

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
  const [searchAiSettings, setSearchAiSettings] = useState(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
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
      setSearchAiSettings(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
      setPickerOpen(false)
    }
  }, [visible, settings])

  const handleSave = useCallback((): void => {
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
    })
    onClose()
    if (modeChanged) {
      window.electronAPI.invoke('app:switch-mode', uiMode)
    }
  }, [defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, uiMode, settings.uiMode, searchAiSettings, onSave, onClose])

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
        <SettingsModalBody
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
      <button type="button" onClick={onClose} style={modalStyles.closeButton} aria-label="Close settings">&times;</button>
    </div>
  )
}

function ModalFooter({ onClose, onSave }: { onClose: () => void; onSave: () => void }): React.JSX.Element {
  return (
    <div style={modalStyles.footer}>
      <button type="button" onClick={onClose} style={modalStyles.cancelButton}>Cancel</button>
      <button type="button" onClick={onSave} style={modalStyles.saveButton}>Save</button>
    </div>
  )
}
