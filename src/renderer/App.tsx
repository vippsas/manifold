import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DockviewReact } from 'dockview'
import { useProjects } from './hooks/useProjects'
import { useAgentSession } from './hooks/useAgentSession'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useAdditionalDirs } from './hooks/useAdditionalDirs'
import { useDiff } from './hooks/useDiff'
import { useSettings } from './hooks/useSettings'
import { useCodeView } from './hooks/useCodeView'
import { useViewState } from './hooks/useViewState'
import { useShellSessions } from './hooks/useShellSession'
import { useGitOperations } from './hooks/useGitOperations'
import { useFetchProject } from './hooks/useFetchProject'
import { useAllProjectSessions } from './hooks/useAllProjectSessions'
import { useTheme } from './hooks/useTheme'
import { useSessionStatePersistence } from './hooks/useSessionStatePersistence'
import { useStatusNotification } from './hooks/useStatusNotification'
import { useUpdateNotification } from '../shared/useUpdateNotification'
import { mergeFileChanges } from './hooks/useFileDiff'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppOverlays } from './hooks/useAppOverlays'
import { useWebPreview } from './hooks/useWebPreview'
import { useDockLayout, isEditorPanelId } from './hooks/useDockLayout'
import { useAppEffects } from './hooks/useAppEffects'
import { PANEL_COMPONENTS, DockStateContext } from './components/editor/dock-panels'
import type { DockAppState } from './components/editor/dock-panel-types'
import { OnboardingView } from './components/modals/OnboardingView'
import { SettingsModal } from './components/modals/SettingsModal'
import { AboutOverlay } from './components/modals/AboutOverlay'
import { UpdateToast } from '../shared/UpdateToast'
import { StatusBar } from './components/git/StatusBar'
import { CommitPanel } from './components/git/CommitPanel'
import { PRPanel } from './components/git/PRPanel'
import { ConflictPanel } from './components/git/ConflictPanel'
import { WelcomeDialog } from './components/modals/WelcomeDialog'
import { DockTab, EmptyWatermark } from './DockTab'
import type { FileOpenRequest } from './components/editor/file-open-request'

interface SearchOpenTarget {
  path: string
  line?: number
  column?: number
  sessionId?: string | null
  openInSplit?: boolean
}

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent } = useAgentSession(activeProjectId)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const allSessions = useMemo(() => Object.values(sessionsByProject).flat(), [sessionsByProject])
  useStatusNotification(allSessions, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(activeSessionId)
  const dockLayout = useDockLayout(activeSessionId)
  const webPreview = useWebPreview(activeSessionId)
  const codeView = useCodeView(activeSessionId)

  const appEffects = useAppEffects({
    activeSessionId,
    dockLayout, webPreviewUrl: webPreview.previewUrl, settings,
    setActiveProject, spawnAgent, refreshOpenFiles: codeView.refreshOpenFiles, refreshDiff,
  })

  const { additionalTrees, additionalBranches } = useAdditionalDirs(activeSessionId, activeSession?.additionalDirs)
  const { tree, changes: watcherChanges, deleteFile, renameFile, createFile, createDir, importPaths, revealInFinder, openInTerminal } = useFileWatcher(activeSessionId, appEffects.handleFilesChanged)
  const mergedChanges = useMemo(() => mergeFileChanges(changedFiles, watcherChanges), [changedFiles, watcherChanges])
  const viewState = useViewState(activeSessionId, tree)

  const ensureEditorVisible = useCallback((preferredPaneId?: string | null): string => {
    return dockLayout.ensureEditorPanel(preferredPaneId ?? codeView.activeEditorPaneId)
  }, [codeView.activeEditorPaneId, dockLayout])

  const { handleSelectFile, handleDeleteFile, handleRenameFile, handleCreateFile, handleCreateDir, handleImportPaths, handleRevealInFinder, handleOpenInTerminal, handleCopyAbsolutePath, handleCopyRelativePath } = useFileOperations(
    viewState.expandAncestors, codeView.handleSelectFile, codeView.handleCloseFile, codeView.handleRenameOpenFile,
    ensureEditorVisible, deleteFile, renameFile, createFile, createDir, importPaths, revealInFinder, openInTerminal,
  )

  useSessionStatePersistence(activeSessionId, viewState, codeView)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const autoGenerateMessages = activeProject?.autoGenerateMessages !== false
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, activeProject?.path ?? null, activeSessionId)
  const gitOps = useGitOperations(activeSessionId)

  const handleFetchSuccess = useCallback((projectId: string) => {
    for (const session of sessionsByProject[projectId] ?? []) {
      void window.electronAPI.invoke('git:ahead-behind', session.id).catch(() => {})
    }
    void gitOps.refreshAheadBehind()
  }, [sessionsByProject, gitOps.refreshAheadBehind])

  const fetchProject = useFetchProject(handleFetchSuccess)
  const overlays = useAppOverlays(gitOps.commit, refreshDiff, spawnAgent, deleteAgent, removeSession, updateSettings, setActiveSession, setActiveProject, activeProjectId)
  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const updateNotification = useUpdateNotification()
  const [lastFileOpenRequest, setLastFileOpenRequest] = useState<FileOpenRequest>({ path: null, source: 'default' })
  const [pendingSearchOpen, setPendingSearchOpen] = useState<SearchOpenTarget | null>(null)

  const openSearchResultInActiveSession = useCallback((target: SearchOpenTarget): void => {
    setLastFileOpenRequest({
      path: target.path,
      line: target.line,
      column: target.column,
      source: 'search',
    })

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
    if (viewState.restoredSessionId !== activeSessionId) return

    openSearchResultInActiveSession(pendingSearchOpen)
    setPendingSearchOpen(null)
  }, [activeSessionId, openSearchResultInActiveSession, pendingSearchOpen, viewState.restoredSessionId])

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
  const handleClosePanel = useCallback((panelId: string): void => {
    if (isEditorPanelId(panelId)) { codeView.removePane(panelId, dockLayout.editorPanelIds.find((id) => id !== panelId) ?? null) }
    dockLayout.closePanel(panelId)
  }, [codeView, dockLayout])

  const handleCreateNewProject = useCallback(async (description: string): Promise<void> => {
    appEffects.setCreatingProject(true)
    try {
      const project = await createNewProject(description)
      if (project) { appEffects.setShowOnboarding(false); void spawnAgent({ projectId: project.id, runtimeId: settings.defaultRuntime, prompt: description }) }
    } finally { appEffects.setCreatingProject(false) }
  }, [createNewProject, spawnAgent, settings.defaultRuntime, appEffects])
  const handleAddProjectFromOnboarding = useCallback(async (path?: string): Promise<void> => {
    await addProject(path); appEffects.setShowOnboarding(false)
  }, [addProject, appEffects])
  const handleCloneFromOnboarding = useCallback(async (url: string): Promise<boolean> => {
    appEffects.setCloningProject(true)
    try { const ok = await cloneProject(url); if (ok) appEffects.setShowOnboarding(false); return ok }
    finally { appEffects.setCloningProject(false) }
  }, [cloneProject, appEffects])

  const baseBranch = activeProject?.baseBranch ?? settings.defaultBaseBranch
  const dockState: DockAppState = {
    sessionId: activeSessionId,
    searchFocusRequestKey: appEffects.searchFocusRequestKey,
    requestedSearchMode: appEffects.requestedSearchMode,
    scrollbackLines: settings.scrollbackLines,
    terminalFontFamily: settings.terminalFontFamily, xtermTheme, diffText: diff,
    openFiles: codeView.openFiles, activeFilePath: codeView.activeFilePath,
    activeEditorPaneId: codeView.activeEditorPaneId, editorPaneIds: dockLayout.editorPanelIds,
    getEditorPane: codeView.getEditorPane, lastFileOpenRequest, theme: themeId,
    onSelectFile: handleSelectFileWithDefaultView, onOpenSearchResult: handleOpenSearchResult, onOpenSearchResultInSplit: handleOpenSearchResultInSplit, onSelectFileFromFileTree: handleSelectFileFromFileTree,
    onSelectOpenFile: handleSelectOpenFile, onSelectFileFromMarkdownPreview: handleSelectFileFromMarkdownPreview,
    onCloseFile: codeView.handleCloseFile,
    onSaveFile: codeView.handleSaveFile, onRegisterEditorPane: codeView.registerPane,
    onActivateEditorPane: handleActivateEditorPane, onSplitEditorPane: handleSplitEditorPane,
    onMoveFileToPane: handleMoveFileToPane, onDeleteFile: handleDeleteFile, onRenameFile: handleRenameFile,
    onCreateFile: handleCreateFile, onCreateDir: handleCreateDir, onImportPaths: handleImportPaths,
    onRevealInFinder: handleRevealInFinder, onOpenInTerminal: handleOpenInTerminal,
    onCopyAbsolutePath: handleCopyAbsolutePath, onCopyRelativePath: handleCopyRelativePath,
    worktreeRootPath: tree?.path ?? undefined, tree, additionalTrees, additionalBranches,
    primaryBranch: activeSession?.branchName ?? null, changes: mergedChanges,
    expandedPaths: viewState.expandedPaths, onToggleExpand: viewState.onToggleExpand, worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId, projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd, baseBranch, defaultRuntime: settings.defaultRuntime,
    onLaunchAgent: overlays.handleLaunchAgent, projects, activeProjectId,
    allProjectSessions: sessionsByProject, onSelectProject: setActiveProject,
    onSelectSession: overlays.handleSelectSession, onRemoveProject: removeProject,
    onUpdateProject: updateProject, onDeleteAgent: overlays.handleDeleteAgent,
    onNewAgentFromHeader: overlays.handleNewAgentFromHeader, newAgentFocusTrigger: overlays.newAgentFocusTrigger,
    onNewProject: () => appEffects.setShowOnboarding(true),
    fetchingProjectId: fetchProject.fetchingProjectId, lastFetchedProjectId: fetchProject.lastFetchedProjectId,
    fetchResult: fetchProject.fetchResult, fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject, previewUrl: webPreview.previewUrl,
    onShowSearchPanel: appEffects.showSearchPanel, onClosePanel: handleClosePanel, activeSessionStatus: activeSession?.status ?? null,
    activeSessionRuntimeId: activeSession?.runtimeId ?? null, onResumeAgent: resumeAgent,
  }

  if (!settings.setupCompleted) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <WelcomeDialog onAddProject={() => void addProject()} onCloneProject={cloneProject} onComplete={overlays.handleSetupComplete} />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <OnboardingView variant="no-project" onAddProject={() => void handleAddProjectFromOnboarding()} onCloneProject={handleCloneFromOnboarding}
          onCreateNewProject={(desc) => void handleCreateNewProject(desc)} creatingProject={appEffects.creatingProject}
          cloningProject={appEffects.cloningProject} createError={projectError} />
      </div>
    )
  }

  return (
    <div className={`layout-root ${themeClass}`}>
      <div className="layout-main">
        <DockStateContext.Provider value={dockState}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DockviewReact className={`dockview-theme-dark dockview-theme-manifold${!activeSessionId ? ' dockview-minimal' : ''}`}
              components={PANEL_COMPONENTS} onReady={(e) => dockLayout.onReady(e.api)}
              defaultTabComponent={DockTab} watermarkComponent={EmptyWatermark} />
          </div>
        </DockStateContext.Provider>
        <StatusBar activeSession={activeSession} changedFiles={mergedChanges} baseBranch={baseBranch} dockLayout={dockLayout}
          conflicts={gitOps.conflicts} aheadBehind={gitOps.aheadBehind} onCommit={() => overlays.setActivePanel('commit')}
          onCreatePR={() => overlays.setActivePanel('pr')} onShowConflicts={() => overlays.setActivePanel('conflicts')}
          onOpenSettings={() => overlays.setShowSettings(true)} />
      </div>
      {overlays.activePanel === 'commit' && activeSessionId && (
        <CommitPanel changedFiles={mergedChanges} diff={diff} autoGenerateMessages={autoGenerateMessages}
          onCommit={overlays.handleCommit} onAiGenerate={gitOps.aiGenerate} onClose={overlays.handleClosePanel} />
      )}
      {overlays.activePanel === 'pr' && activeSessionId && activeSession && (
        <PRPanel sessionId={activeSessionId} branchName={activeSession.branchName} baseBranch={baseBranch}
          autoGenerateMessages={autoGenerateMessages} onAiGenerate={gitOps.aiGenerate}
          getPRContext={gitOps.getPRContext} onClose={overlays.handleClosePanel} />
      )}
      {overlays.activePanel === 'conflicts' && activeSessionId && (
        <ConflictPanel sessionId={activeSessionId} conflicts={gitOps.conflicts} onAiGenerate={gitOps.aiGenerate}
          onResolveConflict={gitOps.resolveConflict} onSelectFile={handleSelectFile} onClose={overlays.handleClosePanel} />
      )}
      <SettingsModal visible={overlays.showSettings} settings={settings} onSave={overlays.handleSaveSettings}
        onClose={() => overlays.setShowSettings(false)} onPreviewTheme={setPreviewThemeId} />
      <AboutOverlay visible={overlays.showAbout} version={overlays.appVersion} onClose={() => overlays.setShowAbout(false)} />
      {updateNotification.updateReady && (
        <UpdateToast version={updateNotification.version} onRestart={updateNotification.install} onDismiss={updateNotification.dismiss} />
      )}
      {appEffects.showOnboarding && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-primary)' }}>
          <OnboardingView variant="no-project" onAddProject={() => void handleAddProjectFromOnboarding()} onCloneProject={handleCloneFromOnboarding}
            onCreateNewProject={(desc) => void handleCreateNewProject(desc)} creatingProject={appEffects.creatingProject}
            cloningProject={appEffects.cloningProject} createError={projectError} onBack={() => appEffects.setShowOnboarding(false)} />
        </div>
      )}
    </div>
  )
}
