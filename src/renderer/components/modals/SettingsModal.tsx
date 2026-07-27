import React, { useState, useEffect, useCallback, useRef } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { ManifoldSettings, EditorSettings } from '../../../shared/types'
import type { AiServiceSettings } from '../../../shared/plugins/api-types'
import { modalStyles } from './SettingsModal.styles'
import { SettingsModalBody, type SettingsTabId } from './settings/SettingsModalBody'

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
  const [notifications, setNotifications] = useState(settings.notifications ?? DEFAULT_SETTINGS.notifications)
  const [shellHistoryScope, setShellHistoryScope] = useState(settings.shellHistoryScope)
  const [shellPromptSegments, setShellPromptSegments] = useState(settings.shellPromptSegments ?? DEFAULT_SETTINGS.shellPromptSegments)
  const [autoGenerateMessages, setAutoGenerateMessages] = useState(settings.autoGenerateMessages)
  const [showCommitAndPrButtons, setShowCommitAndPrButtons] = useState(settings.showCommitAndPrButtons)
  const [sidebarResizeReversed, setSidebarResizeReversed] = useState(settings.sidebarResizeReversed)
  const [useWorktrees, setUseWorktrees] = useState(settings.useWorktrees)
  const [uiScale, setUiScale] = useState(settings.uiScale ?? DEFAULT_SETTINGS.uiScale)
  const [workspacesEnabled, setWorkspacesEnabled] = useState(settings.workspacesEnabled)
  const [searchAiSettings, setSearchAiSettings] = useState(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(settings.editor ?? DEFAULT_SETTINGS.editor!)
  const [transcription, setTranscription] = useState<AiServiceSettings>(
    settings.transcription ?? DEFAULT_SETTINGS.transcription ?? { provider: 'none' }
  )
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    setDefaultRuntime(settings.defaultRuntime)
    setTheme(settings.theme)
    setScrollbackLines(settings.scrollbackLines)
    setTerminalFontFamily(settings.terminalFontFamily)
    setDefaultBaseBranch(settings.defaultBaseBranch)
    setStoragePath(settings.storagePath)
    setNotificationSound(settings.notificationSound)
    setNotifications(settings.notifications ?? DEFAULT_SETTINGS.notifications)
    setShellHistoryScope(settings.shellHistoryScope)
    setShellPromptSegments(settings.shellPromptSegments ?? DEFAULT_SETTINGS.shellPromptSegments)
    setAutoGenerateMessages(settings.autoGenerateMessages)
    setShowCommitAndPrButtons(settings.showCommitAndPrButtons)
    setSidebarResizeReversed(settings.sidebarResizeReversed)
    setUseWorktrees(settings.useWorktrees)
    setUiScale(settings.uiScale ?? DEFAULT_SETTINGS.uiScale)
    setWorkspacesEnabled(settings.workspacesEnabled)
    setSearchAiSettings(settings.search?.ai ?? DEFAULT_SETTINGS.search.ai)
    setEditorSettings(settings.editor ?? DEFAULT_SETTINGS.editor!)
    setTranscription(settings.transcription ?? DEFAULT_SETTINGS.transcription ?? { provider: 'none' })
    setActiveTab('general')
  }, [visible, settings])

  const handleSave = useCallback((): void => {
    onSave({
      defaultRuntime,
      theme,
      scrollbackLines,
      terminalFontFamily,
      defaultBaseBranch,
      storagePath,
      notificationSound,
      notifications,
      shellHistoryScope,
      shellPromptSegments,
      autoGenerateMessages,
      showCommitAndPrButtons,
      sidebarResizeReversed,
      useWorktrees,
      uiScale,
      workspacesEnabled,
      search: { ai: searchAiSettings },
      editor: editorSettings,
      transcription,
    })
    onClose()
  }, [defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, notifications, shellHistoryScope, shellPromptSegments, autoGenerateMessages, showCommitAndPrButtons, sidebarResizeReversed, useWorktrees, uiScale, workspacesEnabled, searchAiSettings, editorSettings, transcription, onSave, onClose])

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
          onTabChange={setActiveTab}
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
          notificationSound={notificationSound}
          onNotificationSoundChange={setNotificationSound}
          notifications={notifications}
          onNotificationsChange={setNotifications}
          shellHistoryScope={shellHistoryScope}
          onShellHistoryScopeChange={setShellHistoryScope}
          shellPromptSegments={shellPromptSegments}
          onShellPromptSegmentsChange={setShellPromptSegments}
          autoGenerateMessages={autoGenerateMessages}
          onAutoGenerateMessagesChange={setAutoGenerateMessages}
          showCommitAndPrButtons={showCommitAndPrButtons}
          onShowCommitAndPrButtonsChange={setShowCommitAndPrButtons}
          sidebarResizeReversed={sidebarResizeReversed}
          onSidebarResizeReversedChange={setSidebarResizeReversed}
          useWorktrees={useWorktrees}
          onUseWorktreesChange={setUseWorktrees}
          uiScale={uiScale}
          onUiScaleChange={setUiScale}
          workspacesEnabled={workspacesEnabled}
          onWorkspacesEnabledChange={setWorkspacesEnabled}
          searchAiSettings={searchAiSettings}
          onSearchAiSettingsChange={setSearchAiSettings}
          editorSettings={editorSettings}
          onEditorSettingsChange={setEditorSettings}
          transcription={transcription}
          onTranscriptionChange={setTranscription}
        />

        <div style={modalStyles.footer}>
          <button type="button" onClick={onClose} style={modalStyles.cancelButton}>Cancel</button>
          <button type="button" onClick={handleSave} style={modalStyles.saveButton}>Save</button>
        </div>
      </div>
    </div>
  )
}
