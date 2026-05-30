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
import { useSuperagentFileBridge } from './hooks/useSuperagentFileBridge'
import { useAutoSelectActiveProject } from './hooks/useAutoSelectActiveProject'
import { useProjectCreateHandlers } from './hooks/useProjectCreateHandlers'
import { useDockLayout } from './hooks/useDockLayout'
import { useAgentSiblingDockTabs } from './hooks/useAgentSiblingDockTabs'
import { useSuperagentChildDockTabs } from './hooks/useSuperagentChildDockTabs'
import { getPrimarySession, siblingPanelId } from './hooks/agent-siblings'
import { useAppEffects } from './hooks/useAppEffects'
import type { DockAppState } from './components/editor/dock-panel-types'
import {
  collectSuperagentIds,
  collectSuperagentChildSessionIds,
  collectSuperagentFleetWorktreePaths,
  filterStandaloneProjectSessions,
  type SessionSelectionOptions,
  shouldPreserveSuperagentSelection,
} from './session-selection'
import { useSuperagents } from './hooks/useSuperagents'
import type { AgentSession } from '../shared/types'
import { isGitProject } from '../shared/project-kind'
import { AppShell } from './AppShell'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds } = useAgentSession(activeProjectId)
  const { drafts, activeDraft, effectiveSessionId, createDraft, discardDraft, promoteDraft } = useDraftChatCoordinator(activeSessionId, setActiveSession, spawnAgent)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const [activeSuperagentId, setActiveSuperagentId] = useState<string | null>(null)
  const [addProjectSuperagentId, setAddProjectSuperagentId] = useState<string | null>(null)
  const [pendingSuperagentProjectIds, setPendingSuperagentProjectIds] = useState<string[]>([])
  const { superagents, createSuperagent, addProjectToSuperagent, removeSuperagent, resumeSuperagent, toggleAutoApprove } = useSuperagents()
  const superagentIds = useMemo(() => collectSuperagentIds(superagents), [superagents])
  const superagentChildSessionIds = useMemo(() => collectSuperagentChildSessionIds(superagents), [superagents])
  const superagentFleetWorktreePaths = useMemo(() => collectSuperagentFleetWorktreePaths(superagents), [superagents])
  const suppressedProjectIds = useMemo(() => new Set(pendingSuperagentProjectIds), [pendingSuperagentProjectIds])

  useAutoSelectActiveProject({
    sessionsByProject, activeProjectId, projects, setActiveProject,
    suppressedProjectIds, superagentChildSessionIds, superagentIds, superagentFleetWorktreePaths,
  })
  const activeSuperagent = superagents.find((s) => s.id === activeSuperagentId) ?? null
  const addProjectSuperagent = superagents.find((s) => s.id === addProjectSuperagentId) ?? null
  useStatusNotification(outputtingSessionIds, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(effectiveSessionId)
  const activeWorktreePath = activeSession?.worktreePath ?? null
  const activeProjectSessions = activeProjectId ? sessionsByProject[activeProjectId] ?? [] : []
  const primarySession = getPrimarySession(activeProjectSessions, activeWorktreePath)
  const primarySessionId = primarySession?.id ?? null
  // Key dockview by superagent when active so child-session selection can change without tearing down the fleet layout.
  const dockLayoutKey = activeSuperagentId ?? primarySessionId ?? activeSessionId
  const dockLayout = useDockLayout(dockLayoutKey, settings.showIdeasTab, settings.showLoopTab, settings.showVerdictsTab, !activeSuperagentId, activeProjectSessions)
  useAgentSiblingDockTabs({
    apiRef: dockLayout.apiRef, layoutVersion: dockLayout.layoutVersion,
    sessions: activeProjectSessions, activeWorktreePath, primarySessionId, activeSessionId,
    disabled: Boolean(activeSuperagentId), onSelectSession: setActiveSession,
  })
  const focusSuperagentHome = useCallback((): void => {
    setActiveSession(null); dockLayout.focusPanel('agent')
  }, [dockLayout, setActiveSession])
  const selectSuperagentChildSession = useCallback((sessionId: string, projectId: string): void => {
    const projectName = projects.find((project) => project.id === projectId)?.name
    setActiveProject(projectId); setActiveSession(sessionId)
    dockLayout.openSiblingPanel(sessionId, projectName, 'agent')
  }, [dockLayout, projects, setActiveProject, setActiveSession])
  useSuperagentChildDockTabs({
    apiRef: dockLayout.apiRef, layoutVersion: dockLayout.layoutVersion,
    superagent: activeSuperagent, projects, allProjectSessions: sessionsByProject,
    onSelectChildSession: selectSuperagentChildSession, onSelectSuperagentHome: focusSuperagentHome,
  })
  // Sync dock's active panel with superagent + session state. Declared AFTER
  // useSuperagentChildDockTabs so sibling panels it adds are guaranteed to exist.
  // Re-fires on layoutReloadVersion only; depending on layoutVersion would
  // revert clicks on unrelated tabs.
  useEffect(() => {
    if (!activeSuperagentId) return
    const api = dockLayout.apiRef.current
    if (!api) return
    const targetId = activeSessionId ? siblingPanelId(activeSessionId) : 'agent'
    const panel = api.getPanel(targetId)
    if (!panel) return
    if (!panel.api.isActive) panel.api.setActive()
  }, [activeSessionId, activeSuperagentId, dockLayout.apiRef, dockLayout.layoutReloadVersion])
  const { superagentFileReader, superagentFileWriter } = useSuperagentFileBridge(activeSuperagent)
  const codeView = useCodeView(effectiveSessionId, superagentFileReader, superagentFileWriter)
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
  const densityClass = settings.density === 'comfortable' ? '' : `density-${settings.density}`
  const updateNotification = useUpdateNotification()
  const updateLog = useUpdateLog()
  const [newSuperagentVisible, setNewSuperagentVisible] = useState(false)
  const worktreeShellCwd = activeSession?.worktreePath ?? activeSuperagent?.coordinationPath ?? null
  const shellProjectCwd = activeSession ? (activeProject?.path ?? null) : null
  const shellSessionKey = activeSessionId ?? activeSuperagentId
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

  const resolveStandaloneSessions = useCallback(async (projectId: string): Promise<AgentSession[]> => {
    try {
      const list = (await window.electronAPI.invoke('agent:sessions', projectId)) as AgentSession[]
      return filterStandaloneProjectSessions(list, superagentChildSessionIds, superagentIds, superagentFleetWorktreePaths)
    } catch {
      return []
    }
  }, [superagentChildSessionIds, superagentFleetWorktreePaths, superagentIds])

  const openSuperagentChildPanel = useCallback((sessionId: string, projectId: string, options?: SessionSelectionOptions): boolean => {
    if (!activeSuperagentId) return false
    if (!shouldPreserveSuperagentSelection(activeSuperagent, projectId, options)) return false
    selectSuperagentChildSession(sessionId, projectId)
    return true
  }, [activeSuperagent, activeSuperagentId, selectSuperagentChildSession])

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
    onSelectProject: (id: string) => { setActiveSuperagentId(null); setActiveProject(id) },
    onSelectSession: (sessionId: string, projectId: string, options?: SessionSelectionOptions) => {
      if (openSuperagentChildPanel(sessionId, projectId, options)) return
      setActiveSuperagentId(null); overlays.handleSelectSession(sessionId, projectId)
    },
    onRemoveProject: removeProject, onUpdateProject: updateProject, onRequestDeleteAgent: overlays.requestDeleteAgent,
    onNewAgentFromHeader: () => { setActiveSuperagentId(null); overlays.handleNewAgentFromHeader() },
    newAgentFocusTrigger: overlays.newAgentFocusTrigger,
    onNewProject: () => appEffects.setShowOnboarding(true),
    onNewSuperagent: () => setNewSuperagentVisible(true),
    superagents, activeSuperagentId, activeSuperagent,
    onSelectSuperagent: (id) => { setActiveSuperagentId(id); focusSuperagentHome() },
    onSelectSuperagentHome: focusSuperagentHome,
    onResumeSuperagent: (id: string) => resumeSuperagent(id),
    onToggleSuperagentAutoApprove: (id: string, value: boolean) => toggleAutoApprove(id, value),
    onRemoveSuperagent: async (id: string) => {
      await removeSuperagent(id)
      setActiveSuperagentId((current) => (current === id ? null : current))
      setAddProjectSuperagentId((current) => (current === id ? null : current))
      setPendingSuperagentProjectIds([])
    },
    onRequestAddProjectToSuperagent: (id: string) => setAddProjectSuperagentId(id),
    onSpawnFleetAgent: async (superagentId: string, projectId: string) => {
      const result = (await window.electronAPI.invoke('superagent:spawn-fleet-agent', superagentId, projectId)) as { id: string }
      if (activeSuperagentId === superagentId && openSuperagentChildPanel(result.id, projectId, { preserveSuperagent: true })) return
      setActiveSuperagentId(null); overlays.handleSelectSession(result.id, projectId)
    },
    fetchingProjectId: fetchProject.fetchingProjectId, lastFetchedProjectId: fetchProject.lastFetchedProjectId,
    fetchResult: fetchProject.fetchResult, fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject,
    onShowSearchPanel: appEffects.showSearchPanel, onClosePanel: editorHandlers.handleClosePanel,
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
      activeSuperagentId={activeSuperagentId}
      activeSuperagent={activeSuperagent}
      activeSession={activeSession ?? null}
      activeProjectIsGit={activeProjectIsGit}
      addProjectSuperagent={addProjectSuperagent}
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
      newSuperagentVisible={newSuperagentVisible}
      setNewSuperagentVisible={setNewSuperagentVisible}
      createSuperagent={createSuperagent}
      setActiveSuperagentId={setActiveSuperagentId}
      addProjectToSuperagent={addProjectToSuperagent}
      setPendingSuperagentProjectIds={setPendingSuperagentProjectIds}
      setAddProjectSuperagentId={setAddProjectSuperagentId}
      resolveStandaloneSessions={resolveStandaloneSessions}
      dockLayout={dockLayout}
      hasSuperagent={Boolean(activeSuperagent)}
      onRenameActiveProject={(name) => { if (activeProjectId) void updateProject(activeProjectId, { name }) }}
    />
  )
}
