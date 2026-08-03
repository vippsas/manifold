import { useCallback, useEffect, useState } from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import type { FileOpenRequest, ScmFileTarget } from '../../components/editor/file-open-request'
import { parseSiblingSessionId } from '../agent-session/agent-siblings'
import { isEditorPanelId } from '../dock-layout/useDockLayout'

interface SearchOpenTarget {
  path: string
  line?: number
  column?: number
  sessionId?: string | null
  openInSplit?: boolean
}

interface UseEditorPaneHandlersArgs {
  activeSessionId: string | null
  activeProjectId: string | null
  /** The session shown in the primary `agent` panel; its tab's × closes the agent. */
  primarySessionId: string | null
  sessionsByProject: Record<string, AgentSession[]>
  projects: Project[]
  restoredSessionId: string | null
  codeView: {
    activeEditorPaneId: string | null
    handleSelectFile: (path: string, paneId?: string) => string
    setActivePane: (paneId: string) => void
    createPane: (paneId: string, refPaneId?: string | null) => void
    moveFileToPane: (path: string, target: string, source?: string | null) => void
    removePane: (paneId: string, fallback: string | null) => void
  }
  dockLayout: {
    splitEditorPane: (paneId: string, direction: 'right' | 'below') => string | null
    focusPanel: (paneId: string) => void
    closePanel: (paneId: string) => void
    editorPanelIds: string[]
    findEditorPanelForSplit: (paneId: string, direction: 'right' | 'below') => string | null
  }
  ensureEditorVisible: (preferredPaneId?: string | null) => string
  handleSelectFile: (path: string) => void
  setActiveSession: (id: string | null) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
}

export interface UseEditorPaneHandlersResult {
  lastFileOpenRequest: FileOpenRequest
  setLastFileOpenRequest: (req: FileOpenRequest) => void
  handleSelectFileWithDefaultView: (filePath: string) => void
  handleSelectFileFromSourceControl: (filePath: string, scm: ScmFileTarget) => void
  handleOpenSearchResult: (target: SearchOpenTarget) => void
  handleOpenSearchResultInSplit: (target: SearchOpenTarget) => void
  handleSelectFileFromFileTree: (filePath: string) => void
  handleSelectOpenFile: (filePath: string, paneId: string) => void
  handleSelectFileFromMarkdownPreview: (filePath: string, paneId: string) => void
  handleActivateEditorPane: (paneId: string) => void
  handleSplitEditorPane: (paneId: string, direction: 'right' | 'below') => void
  handleMoveFileToPane: (filePath: string, targetPaneId: string, sourcePaneId?: string | null) => void
  handleMoveFileToSplitPane: (filePath: string, sourcePaneId: string, direction: 'right' | 'below') => void
  handleClosePanel: (panelId: string) => void
}

export function useEditorPaneHandlers(args: UseEditorPaneHandlersArgs): UseEditorPaneHandlersResult {
  const {
    activeSessionId, activeProjectId, primarySessionId, sessionsByProject, projects, restoredSessionId,
    codeView, dockLayout, ensureEditorVisible, handleSelectFile, setActiveSession, onRequestDeleteAgent,
  } = args

  const [lastFileOpenRequest, setLastFileOpenRequest] = useState<FileOpenRequest>({ path: null, source: 'default' })
  const [pendingSearchOpen, setPendingSearchOpen] = useState<SearchOpenTarget | null>(null)

  const openSearchResultInActiveSession = useCallback((target: SearchOpenTarget): void => {
    setLastFileOpenRequest({ path: target.path, line: target.line, column: target.column, source: 'search' })
    if (target.openInSplit) {
      const referencePaneId = ensureEditorVisible(codeView.activeEditorPaneId)
      const splitPaneId = dockLayout.splitEditorPane(referencePaneId, 'right')
      if (splitPaneId) {
        codeView.createPane(splitPaneId, referencePaneId)
        codeView.setActivePane(splitPaneId)
        const targetPaneId = codeView.handleSelectFile(target.path, splitPaneId)
        dockLayout.focusPanel(targetPaneId)
        return
      }
    }
    handleSelectFile(target.path)
  }, [codeView, dockLayout, ensureEditorVisible, handleSelectFile])

  useEffect(() => {
    if (!pendingSearchOpen) return
    if (!pendingSearchOpen.sessionId || pendingSearchOpen.sessionId !== activeSessionId) return
    if (restoredSessionId !== activeSessionId) return
    openSearchResultInActiveSession(pendingSearchOpen)
    setPendingSearchOpen(null)
  }, [activeSessionId, openSearchResultInActiveSession, pendingSearchOpen, restoredSessionId])

  const handleSelectFileWithDefaultView = useCallback((filePath: string): void => {
    setLastFileOpenRequest({ path: filePath, source: 'default' }); handleSelectFile(filePath)
  }, [handleSelectFile])

  const handleOpenSearchResult = useCallback((target: SearchOpenTarget): void => {
    if (target.sessionId && target.sessionId !== activeSessionId) {
      setPendingSearchOpen(target)
      setActiveSession(target.sessionId)
      return
    }
    setPendingSearchOpen(null)
    openSearchResultInActiveSession(target)
  }, [activeSessionId, openSearchResultInActiveSession, setActiveSession])

  const handleOpenSearchResultInSplit = useCallback((target: SearchOpenTarget): void => {
    handleOpenSearchResult({ ...target, openInSplit: true })
  }, [handleOpenSearchResult])

  // A Source Control row click: opens the file with its checkout recorded, so
  // the editor shows the uncommitted diff (VS Code's SCM click) instead of the
  // session's base-branch diff.
  const handleSelectFileFromSourceControl = useCallback((filePath: string, scm: ScmFileTarget): void => {
    setLastFileOpenRequest({ path: filePath, source: 'sourceControl', scm }); handleSelectFile(filePath)
  }, [handleSelectFile])

  const handleSelectFileFromFileTree = useCallback((filePath: string): void => {
    setLastFileOpenRequest({ path: filePath, source: 'fileTree' }); handleSelectFile(filePath)
  }, [handleSelectFile])

  const handleSelectOpenFile = useCallback((filePath: string, paneId: string): void => {
    codeView.setActivePane(paneId); const t = codeView.handleSelectFile(filePath, paneId); dockLayout.focusPanel(t)
  }, [codeView, dockLayout])

  const handleSelectFileFromMarkdownPreview = useCallback((filePath: string, paneId: string): void => {
    setLastFileOpenRequest({ path: filePath, source: 'markdownPreview' })
    codeView.setActivePane(paneId)
    const targetPaneId = codeView.handleSelectFile(filePath, paneId)
    dockLayout.focusPanel(targetPaneId)
  }, [codeView, dockLayout])

  const handleActivateEditorPane = useCallback((paneId: string): void => {
    codeView.setActivePane(paneId); dockLayout.focusPanel(paneId)
  }, [codeView, dockLayout])

  const handleSplitEditorPane = useCallback((paneId: string, direction: 'right' | 'below'): void => {
    const n = dockLayout.splitEditorPane(paneId, direction); if (!n) return; codeView.createPane(n, paneId); codeView.setActivePane(n)
  }, [codeView, dockLayout])

  const handleMoveFileToPane = useCallback((filePath: string, targetPaneId: string, sourcePaneId?: string | null): void => {
    codeView.moveFileToPane(filePath, targetPaneId, sourcePaneId); codeView.setActivePane(targetPaneId); dockLayout.focusPanel(targetPaneId)
  }, [codeView, dockLayout])

  const handleMoveFileToSplitPane = useCallback((filePath: string, sourcePaneId: string, direction: 'right' | 'below'): void => {
    const existing = dockLayout.findEditorPanelForSplit(sourcePaneId, direction)
    let target = existing
    if (!target) {
      target = dockLayout.splitEditorPane(sourcePaneId, direction)
      if (!target) return
      codeView.createPane(target, sourcePaneId)
    }
    codeView.moveFileToPane(filePath, target, sourcePaneId)
    codeView.setActivePane(target)
    dockLayout.focusPanel(target)
  }, [codeView, dockLayout])

  const handleClosePanel = useCallback((panelId: string): void => {
    // An agent tab *is* its agent, so its × closes the agent (behind the usual
    // confirm) rather than hiding a panel. The primary `agent` panel itself
    // stays — it is the workspace's agent surface, empty or not.
    const agentSessionId = panelId === 'agent' ? primarySessionId : parseSiblingSessionId(panelId)
    if (agentSessionId) {
      const session = (sessionsByProject[activeProjectId ?? ''] ?? []).find((s) => s.id === agentSessionId)
        ?? Object.values(sessionsByProject).flat().find((s) => s.id === agentSessionId)
      if (!session) return
      const projectPath = projects.find((p) => p.id === session.projectId)?.path ?? ''
      onRequestDeleteAgent(session, projectPath)
      return
    }
    if (isEditorPanelId(panelId)) {
      codeView.removePane(panelId, dockLayout.editorPanelIds.find((id) => id !== panelId) ?? null)
    }
    dockLayout.closePanel(panelId)
  }, [codeView, dockLayout, sessionsByProject, activeProjectId, primarySessionId, projects, onRequestDeleteAgent])

  return {
    lastFileOpenRequest,
    setLastFileOpenRequest,
    handleSelectFileWithDefaultView,
    handleSelectFileFromSourceControl,
    handleOpenSearchResult,
    handleOpenSearchResultInSplit,
    handleSelectFileFromFileTree,
    handleSelectOpenFile,
    handleSelectFileFromMarkdownPreview,
    handleActivateEditorPane,
    handleSplitEditorPane,
    handleMoveFileToPane,
    handleMoveFileToSplitPane,
    handleClosePanel,
  }
}
