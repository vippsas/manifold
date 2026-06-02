import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useUpdateLog } from '../shared/useUpdateLog'
import { useUpdateNotification } from '../shared/useUpdateNotification'
import { mergeFileChanges } from './hooks/useFileDiff'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppOverlays } from './hooks/useAppOverlays'
import { useDraftChatCoordinator } from './hooks/useDraftChatCoordinator'
import { useEditorPaneHandlers } from './hooks/useEditorPaneHandlers'
import { useAutoSelectActiveProject } from './hooks/useAutoSelectActiveProject'
import { useProjectCreateHandlers } from './hooks/useProjectCreateHandlers'
import { useDockLayout } from './hooks/useDockLayout'
import { useSidebarHandleCycle } from './hooks/useSidebarHandleCycle'
import { useAgentSiblingDockTabs } from './hooks/useAgentSiblingDockTabs'
import { getPrimarySession } from './hooks/agent-siblings'
import { useAppEffects } from './hooks/useAppEffects'
import type { DockAppState } from './components/editor/dock-panel-types'
import { useWorkspaces } from './hooks/useWorkspaces'
import type { AgentSession } from '../shared/types'
import { isGitProject } from '../shared/project-kind'
import { AppShell } from './AppShell'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds } = useAgentSession(activeProjectId)
  const { drafts, activeDraft, effectiveSessionId, createDraft, discardDraft, promoteDraft } = useDraftChatCoordinator(activeSessionId, setActiveSession, spawnAgent)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const { workspaces, createWorkspace, removeWorkspace, spawnAgent: spawnWorkspaceAgent } = useWorkspaces()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [newWorkspaceVisible, setNewWorkspaceVisible] = useState(false)
  const suppressedProjectIds = useMemo(() => new Set<string>(), [])
  const sessionsByWorkspace = useMemo(() => {
    const map: Record<string, AgentSession[]> = {}
    for (const sessions of Object.values(sessionsByProject ?? {})) {
      for (const sx of sessions) {
        if (sx.workspaceId) (map[sx.workspaceId] ??= []).push(sx)
      }
    }
    return map
  }, [sessionsByProject])
  const workspaceIdBySession = useMemo(() => {
    const map: Record<string, string> = {}
    for (const sessions of Object.values(sessionsByProject ?? {})) {
      for (const sx of sessions) {
        if (sx.workspaceId) map[sx.id] = sx.workspaceId
      }
    }
    return map
  }, [sessionsByProject])

  useAutoSelectActiveProject({
    sessionsByProject, activeProjectId, projects, setActiveProject,
    suppressedProjectIds,
  })
  useStatusNotification(outputtingSessionIds, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(effectiveSessionId)
  const activeWorktreePath = activeSession?.worktreePath ?? null
  const activeProjectSessions = activeProjectId ? sessionsByProject[activeProjectId] ?? [] : []
  const primarySession = getPrimarySession(activeProjectSessions, activeWorktreePath)
  const primarySessionId = primarySession?.id ?? null
  const dockLayoutKey = primarySessionId ?? activeSessionId
  const dockLayout = useDockLayout(dockLayoutKey, activeProjectSessions)
  useSidebarHandleCycle(dockLayout.apiRef, settings.sidebarResizeReversed)
  useAgentSiblingDockTabs({
    apiRef: dockLayout.apiRef, layoutVersion: dockLayout.layoutVersion,
    sessions: activeProjectSessions, activeWorktreePath, primarySessionId, activeSessionId,
    disabled: false, onSelectSession: setActiveSession,
  })
  const codeView = useCodeView(effectiveSessionId)
  const appEffects = useAppEffects({
    activeSessionId, dockLayout, settings,
    setActiveProject, spawnAgent, refreshOpenFiles: codeView.refreshOpenFiles, refreshDiff,
  })
  const { additionalTrees, additionalBranches } = useAdditionalDirs(effectiveSessionId, activeSession?.additionalDirs)
  const { tree, changes: watcherChanges, deleteFile, renameFile, createFile, createDir, importPaths, movePath, revealInFinder, openInTerminal } = useFileWatcher(effectiveSessionId, appEffects.handleFilesChanged, activeDraft?.projectId ?? null)
  const mergedChanges = useMemo(() => mergeFileChanges(changedFiles, watcherChanges), [changedFiles, watcherChanges])
  const viewState = useViewState(effectiveSessionId, tree)

  const ensureEditorVisible = useCallback((preferredPaneId?: string | null): string => {
    return dockLayout.ensureEditorPanel(preferredPaneId ?? codeView.activeEditorPaneId)
  }, [codeView.activeEditorPaneId, dockLayout])

  const { handleSelectFile, handleDeleteFile, handleRenameFile, handleCreateFile, handleCreateDir, handleImportPaths, handleMovePath, handleRevealInFinder, handleOpenInTerminal, handleCopyAbsolutePath, handleCopyRelativePath } = useFileOperations(
    viewState.expandAncestors, codeView.handleSelectFile, codeView.handleCloseFile, codeView.handleRenameOpenFile,
    ensureEditorVisible, deleteFile, renameFile, createFile, createDir, importPaths, movePath, revealInFinder, openInTerminal,
  )
  useSessionStatePersistence(effectiveSessionId, viewState, codeView)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const gitOps = useGitOperations(effectiveSessionId)

  const handleFetchSuccess = useCallback((projectId: string) => {
    for (const session of sessionsByProject[projectId] ?? []) {
      void window.electronAPI.invoke('git:ahead-behind', session.id).catch(() => {})
    }
    void gitOps.refreshAheadBehind()
  }, [sessionsByProject, gitOps.refreshAheadBehind])

  const fetchProject = useFetchProject(handleFetchSuccess)
  const overlays = useAppOverlays(gitOps.commit, refreshDiff, spawnAgent, deleteAgent, removeSession, updateSettings, setActiveSession, setActiveProject, activeProjectId)
  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const toggleTheme = useCallback(() => {
    const nextId = themeId.endsWith('-light')
      ? themeId.replace(/-light$/, '-dark')
      : themeId.replace(/-dark$/, '-light')
    void updateSettings({ theme: nextId })
  }, [themeId, updateSettings])
  const themeFamily: 'manifold' | 'garfield' =
    themeId.startsWith('garfield') ? 'garfield' : 'manifold'
  const selectThemeFamily = useCallback((family: 'manifold' | 'garfield') => {
    const suffix = themeId.endsWith('-light') ? '-light' : '-dark'
    void updateSettings({ theme: `${family}${suffix}` })
  }, [themeId, updateSettings])
  const densityClass = settings.density === 'comfortable' ? '' : `density-${settings.density}`
  const updateNotification = useUpdateNotification()
  const updateLog = useUpdateLog()
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const shellProjectCwd = activeSession ? (activeProject?.path ?? null) : null
  const shellSessionKey = activeSessionId
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, shellProjectCwd, shellSessionKey)

  const editorHandlers = useEditorPaneHandlers({
    activeSessionId, activeProjectId, sessionsByProject, projects,
    restoredSessionId: viewState.restoredSessionId,
    codeView, dockLayout, ensureEditorVisible, handleSelectFile, setActiveSession,
    onRequestDeleteAgent: overlays.requestDeleteAgent,
  })

  const { handleCreateNewProject, handleAddProjectFromOnboarding, handleCloneFromOnboarding } = useProjectCreateHandlers({
    createNewProject, addProject, cloneProject, spawnAgent, setActiveSession,
    defaultRuntime: settings.defaultRuntime, appEffects,
  })

  // Keep the creating cover up until the freshly spawned agent's chat is on
  // screen, then reveal it — this skips the brief "new agent" overview flash.
  useEffect(() => {
    if (appEffects.creatingProject && activeSession) appEffects.setCreatingProject(false)
  }, [appEffects.creatingProject, activeSession, appEffects.setCreatingProject])

  const activeProjectIsGit = isGitProject(activeProject)
  const baseBranch = activeProjectIsGit ? activeProject?.baseBranch ?? settings.defaultBaseBranch : ''

  const dockState: DockAppState = {
    sessionId: effectiveSessionId, primarySessionId,
    searchFocusRequestKey: appEffects.searchFocusRequestKey, requestedSearchMode: appEffects.requestedSearchMode,
    scrollbackLines: settings.scrollbackLines, terminalFontFamily: settings.terminalFontFamily, xtermTheme, diffText: diff,
    openFiles: codeView.openFiles, activeFilePath: codeView.activeFilePath,
    activeEditorPaneId: codeView.activeEditorPaneId, editorPaneIds: dockLayout.editorPanelIds,
    getEditorPane: codeView.getEditorPane, lastFileOpenRequest: editorHandlers.lastFileOpenRequest, theme: themeId,
    onSelectFile: editorHandlers.handleSelectFileWithDefaultView,
    onOpenSearchResult: editorHandlers.handleOpenSearchResult,
    onOpenSearchResultInSplit: editorHandlers.handleOpenSearchResultInSplit,
    onSelectFileFromFileTree: editorHandlers.handleSelectFileFromFileTree,
    onSelectOpenFile: editorHandlers.handleSelectOpenFile,
    onSelectFileFromMarkdownPreview: editorHandlers.handleSelectFileFromMarkdownPreview,
    onCloseFile: codeView.handleCloseFile, onSaveFile: codeView.handleSaveFile, onRegisterEditorPane: codeView.registerPane,
    onActivateEditorPane: editorHandlers.handleActivateEditorPane,
    onSplitEditorPane: editorHandlers.handleSplitEditorPane,
    onMoveFileToPane: editorHandlers.handleMoveFileToPane,
    onMoveFileToSplitPane: editorHandlers.handleMoveFileToSplitPane,
    onDeleteFile: handleDeleteFile, onRenameFile: handleRenameFile,
    onCreateFile: handleCreateFile, onCreateDir: handleCreateDir, onImportPaths: handleImportPaths, onMovePath: handleMovePath,
    onRevealInFinder: handleRevealInFinder, onOpenInTerminal: handleOpenInTerminal,
    onCopyAbsolutePath: handleCopyAbsolutePath, onCopyRelativePath: handleCopyRelativePath,
    worktreeRootPath: tree?.path ?? undefined, tree, additionalTrees, additionalBranches,
    primaryBranch: activeSession?.branchName ?? null, changes: mergedChanges,
    expandedPaths: viewState.expandedPaths, onToggleExpand: viewState.onToggleExpand, worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId, projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd, baseBranch, activeProjectIsGit,
    defaultRuntime: settings.defaultRuntime, defaultAgentMode: settings.defaultAgentMode ?? 'chat',
    activeSessionWorktreePath: activeSession?.worktreePath ?? null,
    activeSessionNoWorktree: activeSession?.noWorktree ?? false,
    onLaunchAgent: overlays.handleLaunchAgent, projects, activeProjectId, suppressedProjectIds,
    allProjectSessions: sessionsByProject, outputtingSessionIds,
    onSelectProject: (id: string) => { setActiveWorkspaceId(null); setActiveProject(id) },
    onSelectSession: (sessionId: string, projectId: string) => {
      setActiveWorkspaceId(workspaceIdBySession[sessionId] ?? null)
      overlays.handleSelectSession(sessionId, projectId)
    },
    onRemoveProject: removeProject, onUpdateProject: updateProject, onRequestDeleteAgent: overlays.requestDeleteAgent,
    onNewAgentFromHeader: () => { setActiveWorkspaceId(null); overlays.handleNewAgentFromHeader() },
    newAgentFocusTrigger: overlays.newAgentFocusTrigger,
    onNewProject: () => appEffects.setShowOnboarding(true),
    workspaces, activeWorkspaceId, sessionsByWorkspace,
    onNewWorkspace: () => setNewWorkspaceVisible(true),
    onSelectWorkspace: (id: string) => { setActiveWorkspaceId(id) },
    onRemoveWorkspace: async (id: string) => {
      await removeWorkspace(id)
      setActiveWorkspaceId((current) => (current === id ? null : current))
    },
    onSpawnWorkspaceAgent: async (workspaceId: string) => {
      const session = await spawnWorkspaceAgent(workspaceId, { runtimeId: settings.defaultRuntime })
      setActiveWorkspaceId(workspaceId); overlays.handleSelectSession(session.id, session.projectId)
    },
    fetchingProjectId: fetchProject.fetchingProjectId, lastFetchedProjectId: fetchProject.lastFetchedProjectId,
    fetchResult: fetchProject.fetchResult, fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject,
    onShowSearchPanel: appEffects.showSearchPanel, onClosePanel: editorHandlers.handleClosePanel,
    onOpenModule: (id) => {
      if (dockLayout.isPanelVisible(id)) dockLayout.focusPanel(id)
      else dockLayout.togglePanel(id)
    },
    isModuleOpen: dockLayout.isPanelVisible,
    onFocusPanel: dockLayout.focusPanel,
    onOpenSibling: dockLayout.openSiblingPanel, onCloseSiblingPanel: dockLayout.closeSiblingPanel,
    activeSessionStatus: activeSession?.status ?? null,
    activeSessionRuntimeId: activeSession?.runtimeId ?? null, onResumeAgent: resumeAgent,
    drafts, activeDraft, promoteDraft, discardDraft,
  }

  return (
    <AppShell
      themeClass={themeClass}
      densityClass={densityClass}
      settings={settings}
      projects={projects}
      projectError={projectError}
      activeProjectId={activeProjectId}
      activeSessionId={activeSessionId}
      activeSession={activeSession ?? null}
      activeProjectIsGit={activeProjectIsGit}
      baseBranch={baseBranch}
      autoGenerateMessages={settings.autoGenerateMessages}
      diff={diff}
      mergedChanges={mergedChanges}
      sessionsByProject={sessionsByProject}
      dockState={dockState}
      onDockReady={dockLayout.onReady}
      dockLayoutSlot={null}
      overlays={overlays}
      gitOps={gitOps}
      updateLog={updateLog}
      updateNotification={updateNotification}
      appEffects={appEffects}
      showCommitAndPrButtons={settings.showCommitAndPrButtons && activeProjectIsGit}
      handleSelectFile={handleSelectFile}
      setPreviewThemeId={setPreviewThemeId}
      addProject={addProject}
      cloneProject={cloneProject}
      handleAddProjectFromOnboarding={handleAddProjectFromOnboarding}
      handleCloneFromOnboarding={handleCloneFromOnboarding}
      handleCreateNewProject={handleCreateNewProject}
      newWorkspaceVisible={newWorkspaceVisible}
      setNewWorkspaceVisible={setNewWorkspaceVisible}
      createWorkspace={createWorkspace}
      dockLayout={dockLayout}
      onRenameActiveProject={(name) => { if (activeProjectId) void updateProject(activeProjectId, { name }) }}
      onToggleTheme={toggleTheme}
      themeFamily={themeFamily}
      onSelectThemeFamily={selectThemeFamily}
    />
  )
}
