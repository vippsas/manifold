import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SpawnAgentOptions, ManifoldSettings, AgentSession } from '../../shared/types'
import type { PendingDelete } from '../components/sidebar/DeleteAgentDialog'

interface SpawnedSession { id: string }

export interface UseAppOverlaysResult {
  activePanel: 'commit' | 'pr' | 'conflicts' | null
  setActivePanel: (panel: 'commit' | 'pr' | 'conflicts' | null) => void
  handleNewAgentFromHeader: () => void
  newAgentFocusTrigger: number
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  showAbout: boolean
  setShowAbout: (show: boolean) => void
  showCommandPalette: boolean
  setShowCommandPalette: (show: boolean) => void
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
  showDashboard: boolean
  setShowDashboard: (show: boolean) => void
  /** Card id to open the Dashboard straight into (null = land on the grid). */
  dashboardInitialCard: string | null
  setDashboardInitialCard: (cardId: string | null) => void
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
  confirmDeleteAgent: (mode?: 'session' | 'worktree') => Promise<void>
}

export function useAppOverlays(
  commit: (message: string) => Promise<void>,
  refreshDiff: () => Promise<void>,
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>,
  deleteAgent: (sessionId: string, mode?: 'session' | 'worktree') => Promise<void>,
  removeSession: (sessionId: string) => void,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  setActiveSession: (sessionId: string | null) => void,
  setActiveProject: (projectId: string) => void,
  activeProjectId: string | null
): UseAppOverlaysResult {
  const [activePanel, setActivePanel] = useState<'commit' | 'pr' | 'conflicts' | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [dashboardInitialCard, setDashboardInitialCard] = useState<string | null>(null)
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

  const handleLaunchAgent = useCallback(async (options: SpawnAgentOptions): Promise<unknown> => {
    const session = (await spawnAgent(options)) as SpawnedSession | null
    if (session && options.nonInteractive) {
      // Subscribe so the chat panel receives agent messages once the first
      // user message triggers spawnPrintModeFollowUp on the main side.
      try {
        await window.electronAPI.invoke('simple:subscribe-chat', session.id)
      } catch (err) {
        console.error(`[handleLaunchAgent] simple:subscribe-chat failed for ${session.id}:`, err)
      }
    }
    return session
  }, [spawnAgent])

  const requestDeleteAgent = useCallback((session: AgentSession, projectPath: string): void => {
    // A locked agent can't be deleted — don't open the destructive dialog. This
    // is the single chokepoint every delete entry point funnels through (sidebar,
    // workspace list, dock panel, onboarding card). The main process refuses too.
    if (session.locked) return
    setPendingDelete({ session, projectPath })
  }, [])

  const cancelDeleteAgent = useCallback((): void => {
    if (deletingSessionId) return
    setPendingDelete(null)
  }, [deletingSessionId])

  const confirmDeleteAgent = useCallback(async (mode?: 'session' | 'worktree'): Promise<void> => {
    if (!pendingDelete) return
    const sessionId = pendingDelete.session.id
    setDeletingSessionId(sessionId)
    try {
      await deleteAgent(sessionId, mode)
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

  return useMemo(() => ({
    activePanel,
    setActivePanel,
    handleNewAgentFromHeader,
    newAgentFocusTrigger,
    showSettings,
    setShowSettings,
    showAbout,
    setShowAbout,
    showCommandPalette,
    setShowCommandPalette,
    showShortcuts,
    setShowShortcuts,
    showDashboard,
    setShowDashboard,
    dashboardInitialCard,
    setDashboardInitialCard,
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
    showSettings, showAbout, showCommandPalette, showShortcuts, showDashboard, dashboardInitialCard, appVersion, handleCommit, handleClosePanel,
    handleLaunchAgent, handleSelectSession, handleSaveSettings, handleSetupComplete,
    pendingDelete, deletingSessionId, requestDeleteAgent, cancelDeleteAgent, confirmDeleteAgent,
  ])
}
