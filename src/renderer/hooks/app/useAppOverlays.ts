import { useState, useCallback, useEffect, useMemo } from 'react'
import type { ManifoldSettings, AgentSession } from '../../../shared/types'
import type { SearchMode } from '../../../shared/search-types'
import type { PendingDelete } from '../../components/sidebar/DeleteAgentDialog'

export interface UseAppOverlaysResult {
  activePanel: 'commit' | 'pr' | 'conflicts' | null
  setActivePanel: (panel: 'commit' | 'pr' | 'conflicts' | null) => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  showAbout: boolean
  setShowAbout: (show: boolean) => void
  showCommandPalette: boolean
  setShowCommandPalette: (show: boolean) => void
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
  showSearch: boolean
  /** Scope the search modal opens on (null = keep its default). */
  searchMode: SearchMode | null
  openSearch: (mode?: SearchMode) => void
  closeSearch: () => void
  showDashboard: boolean
  setShowDashboard: (show: boolean) => void
  /** Card id to open the Dashboard straight into (null = land on the grid). */
  dashboardInitialCard: string | null
  setDashboardInitialCard: (cardId: string | null) => void
  appVersion: string
  handleCommit: (message: string) => Promise<void>
  handleClosePanel: () => void
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
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
  const [showDashboard, setShowDashboard] = useState(false)
  const [dashboardInitialCard, setDashboardInitialCard] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const handleCommit = useCallback(async (message: string): Promise<void> => {
    await commit(message)
    void refreshDiff()
    setActivePanel('pr')
  }, [commit, refreshDiff])

  const handleClosePanel = useCallback((): void => { setActivePanel(null) }, [])

  const openSearch = useCallback((mode?: SearchMode): void => {
    setSearchMode(mode ?? null)
    setShowSearch(true)
  }, [])

  const closeSearch = useCallback((): void => { setShowSearch(false) }, [])

  const requestDeleteAgent = useCallback((session: AgentSession, projectPath: string): void => {
    // A locked agent can't be deleted — don't open the destructive dialog. This
    // is the single chokepoint every delete entry point funnels through (the
    // agent tab's 🗑, the Delete Agent command, and the reusable-sessions card
    // in the New Agent view). The main process refuses too.
    if (session.locked) return
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
    showSettings,
    setShowSettings,
    showAbout,
    setShowAbout,
    showCommandPalette,
    setShowCommandPalette,
    showShortcuts,
    setShowShortcuts,
    showSearch,
    searchMode,
    openSearch,
    closeSearch,
    showDashboard,
    setShowDashboard,
    dashboardInitialCard,
    setDashboardInitialCard,
    appVersion,
    handleCommit,
    handleClosePanel,
    handleSelectSession,
    handleSaveSettings,
    handleSetupComplete,
    pendingDelete,
    deletingSessionId,
    requestDeleteAgent,
    cancelDeleteAgent,
    confirmDeleteAgent,
  }), [
    activePanel,
    showSettings, showAbout, showCommandPalette, showShortcuts, showSearch, searchMode, openSearch, closeSearch,
    showDashboard, dashboardInitialCard, appVersion, handleCommit, handleClosePanel,
    handleSelectSession, handleSaveSettings, handleSetupComplete,
    pendingDelete, deletingSessionId, requestDeleteAgent, cancelDeleteAgent, confirmDeleteAgent,
  ])
}
