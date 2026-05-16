import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SpawnAgentOptions, ManifoldSettings, AgentSession } from '../../shared/types'
import type { PendingDelete } from '../components/sidebar/DeleteAgentDialog'

export interface UseAppOverlaysResult {
  activePanel: 'commit' | 'pr' | 'conflicts' | null
  setActivePanel: (panel: 'commit' | 'pr' | 'conflicts' | null) => void
  handleNewAgentFromHeader: () => void
  newAgentFocusTrigger: number
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  showAbout: boolean
  setShowAbout: (show: boolean) => void
  appVersion: string
  handleCommit: (message: string) => Promise<void>
  handleClosePanel: () => void
  handleLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
  handleSelectSession: (sessionId: string, projectId: string) => void
  handleSaveSettings: (partial: Partial<ManifoldSettings>) => void
  handleSetupComplete: () => void
  // Delete-agent confirmation
  pendingDelete: PendingDelete | null
  deletingSessionId: string | null
  requestDeleteAgent: (session: AgentSession, projectPath: string) => void
  cancelDeleteAgent: () => void
  confirmDeleteAgent: () => Promise<void>
}

export function useAppOverlays(
  commit: (message: string) => Promise<void>,
  refreshDiff: () => Promise<void>,
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>,
  deleteAgent: (sessionId: string) => Promise<void>,
  removeSession: (sessionId: string) => void,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  setActiveSession: (sessionId: string | null) => void,
  setActiveProject: (projectId: string) => void,
  activeProjectId: string | null
): UseAppOverlaysResult {
  const [activePanel, setActivePanel] = useState<'commit' | 'pr' | 'conflicts' | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [newAgentFocusTrigger, setNewAgentFocusTrigger] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const handleCommit = useCallback(async (message: string): Promise<void> => {
    await commit(message)
    void refreshDiff()
    setActivePanel('pr')
  }, [commit, refreshDiff])

  const handleClosePanel = useCallback((): void => { setActivePanel(null) }, [])

  const handleLaunchAgent = useCallback((options: SpawnAgentOptions): Promise<unknown> => {
    return spawnAgent(options)
  }, [spawnAgent])

  const requestDeleteAgent = useCallback((session: AgentSession, projectPath: string): void => {
    setPendingDelete({ session, projectPath })
  }, [])

  const cancelDeleteAgent = useCallback((): void => {
    if (deletingSessionId) return
    setPendingDelete(null)
  }, [deletingSessionId])

  const confirmDeleteAgent = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return
    const sessionId = pendingDelete.session.id
    setDeletingSessionId(sessionId)
    try {
      await deleteAgent(sessionId)
      removeSession(sessionId)
      setPendingDelete(null)
    } catch {
      // Keep the confirmation dialog open if deletion fails.
    } finally {
      setDeletingSessionId(null)
    }
  }, [deleteAgent, removeSession, pendingDelete])

  const handleSelectSession = useCallback((sessionId: string, projectId: string): void => {
    setActiveSession(sessionId)
    if (projectId !== activeProjectId) setActiveProject(projectId)
  }, [activeProjectId, setActiveSession, setActiveProject])

  const handleNewAgentFromHeader = useCallback((): void => {
    setActiveSession(null)
    setNewAgentFocusTrigger((n) => n + 1)
  }, [setActiveSession])

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

  useEffect(() => {
    const unsub = window.electronAPI.on('show-settings', () => setShowSettings(true))
    return unsub
  }, [])

  return useMemo(() => ({
    activePanel,
    setActivePanel,
    handleNewAgentFromHeader,
    newAgentFocusTrigger,
    showSettings,
    setShowSettings,
    showAbout,
    setShowAbout,
    appVersion,
    handleCommit,
    handleClosePanel,
    handleLaunchAgent,
    handleSelectSession,
    handleSaveSettings,
    handleSetupComplete,
    pendingDelete,
    deletingSessionId,
    requestDeleteAgent,
    cancelDeleteAgent,
    confirmDeleteAgent,
  }), [
    activePanel, handleNewAgentFromHeader, newAgentFocusTrigger,
    showSettings, showAbout, appVersion, handleCommit, handleClosePanel,
    handleLaunchAgent, handleSelectSession, handleSaveSettings, handleSetupComplete,
    pendingDelete, deletingSessionId, requestDeleteAgent, cancelDeleteAgent, confirmDeleteAgent,
  ])
}
