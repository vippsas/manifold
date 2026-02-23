import React, { useState, useCallback, useEffect } from 'react'
import type { SpawnAgentOptions, ManifoldSettings } from '../../shared/types'

export interface UseAppOverlaysResult {
  activePanel: 'commit' | 'pr' | 'conflicts' | null
  setActivePanel: (panel: 'commit' | 'pr' | 'conflicts' | null) => void
  showNewAgent: boolean
  setShowNewAgent: (show: boolean) => void
  showProjectPicker: boolean
  setShowProjectPicker: (show: boolean) => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  showAbout: boolean
  appVersion: string
  handleCommit: (message: string) => Promise<void>
  handleClosePanel: () => void
  handleLaunchAgent: (options: SpawnAgentOptions) => void
  handleDeleteAgent: (sessionId: string) => void
  handleSelectSession: (sessionId: string, projectId: string) => void
  handleNewAgentForProject: (projectId: string) => void
  handleSaveSettings: (partial: Partial<ManifoldSettings>) => void
  handleSetupComplete: () => void
}

export function useAppOverlays(
  commit: (message: string) => Promise<void>,
  refreshDiff: () => Promise<void>,
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>,
  deleteAgent: (sessionId: string) => void,
  removeSession: (sessionId: string) => void,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  setActiveSession: (sessionId: string) => void,
  setActiveProject: (projectId: string) => void,
  activeProjectId: string | null
): UseAppOverlaysResult {
  const [activePanel, setActivePanel] = useState<'commit' | 'pr' | 'conflicts' | null>(null)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  const handleCommit = useCallback(async (message: string): Promise<void> => {
    await commit(message)
    void refreshDiff()
    setActivePanel('pr')
  }, [commit, refreshDiff])

  const handleClosePanel = useCallback((): void => { setActivePanel(null) }, [])

  const handleLaunchAgent = useCallback((options: SpawnAgentOptions): void => {
    void spawnAgent(options)
    setShowNewAgent(false)
  }, [spawnAgent])

  const handleDeleteAgent = useCallback((sessionId: string): void => {
    void deleteAgent(sessionId)
    removeSession(sessionId)
    void window.electronAPI.invoke('view-state:delete', sessionId)
  }, [deleteAgent, removeSession])

  const handleSelectSession = useCallback((sessionId: string, projectId: string): void => {
    setActiveSession(sessionId)
    if (projectId !== activeProjectId) setActiveProject(projectId)
  }, [activeProjectId, setActiveSession, setActiveProject])

  const handleNewAgentForProject = useCallback((projectId: string): void => {
    if (projectId !== activeProjectId) setActiveProject(projectId)
    setShowProjectPicker(false)
    setShowNewAgent(true)
  }, [activeProjectId, setActiveProject])

  const handleSaveSettings = useCallback((partial: Partial<ManifoldSettings>): void => {
    void updateSettings(partial)
  }, [updateSettings])

  const handleSetupComplete = useCallback((): void => {
    void updateSettings({ setupCompleted: true })
  }, [updateSettings])

  useEffect(() => {
    void window.electronAPI.invoke('app:version').then((v) => setAppVersion(v as string))
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.on('show-about', () => setShowAbout(true))
    return unsub
  }, [])

  return {
    activePanel,
    setActivePanel,
    showNewAgent,
    setShowNewAgent,
    showProjectPicker,
    setShowProjectPicker,
    showSettings,
    setShowSettings,
    showAbout,
    appVersion,
    handleCommit,
    handleClosePanel,
    handleLaunchAgent,
    handleDeleteAgent,
    handleSelectSession,
    handleNewAgentForProject,
    handleSaveSettings,
    handleSetupComplete,
  }
}
