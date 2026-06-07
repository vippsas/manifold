import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useThemeChangeNotification } from './hooks/useThemeChangeNotification'
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
import { buildRootLabels } from './components/editor/file-tree-labels'
import { useWorkspaces } from './hooks/useWorkspaces'
import { useFavorites } from './hooks/useFavorites'
import type { AgentSession, ResolvedFavorite } from '../shared/types'
import { isGitProject } from '../shared/project-kind'
import { AppShell } from './AppShell'
import { QuickOpen } from './components/editor/QuickOpen'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds } = useAgentSession(activeProjectId)
  const { drafts, activeDraft, effectiveSessionId, createDraft, discardDraft, promoteDraft } = useDraftChatCoordinator(activeSessionId, setActiveSession, spawnAgent)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const { workspaces, createWorkspace, removeWorkspace, addProject: addProjectToWorkspace, removeProject: removeProjectFromWorkspace, spawnAgent: spawnWorkspaceAgent } = useWorkspaces()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const { favorites, isFavorite, toggleFavorite, reorderFavorites } = useFavorites(
    settings, updateSettings, projects, workspaces,
  )
  const activateFavorite = useCallback((fav: ResolvedFavorite): void => {
    // Branches are intentionally asymmetric: the repo branch mirrors onSelectProject
    // (clear workspace, set project; session is NOT cleared) so a ⌘-jump matches a
    // sidebar repo click, while the workspace branch mirrors onSelectWorkspaceRepo
    // (set home repo and clear the session).
    if (fav.kind === 'repo') {
      setActiveWorkspaceId(null)
      setActiveProject(fav.id)
    } else {
      const ws = workspaces.find((w) => w.id === fav.id)
      setActiveWorkspaceId(fav.id)
      if (ws && ws.projectIds[0]) setActiveProject(ws.projectIds[0])
      setActiveSession(null)
    }
  }, [workspaces, setActiveProject, setActiveSession])
  const jumpToFavorite = useCallback((index: number): void => {
    const fav = favorites[index]
    if (fav) activateFavorite(fav)
  }, [favorites, activateFavorite])
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [newWorkspaceVisible, setNewWorkspaceVisible] = useState(false)
  const [addProjectWorkspaceId, setAddProjectWorkspaceId] = useState<string | null>(null)
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
    jumpToFavorite,
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

  const renameAgent = useCallback((sessionId: string, displayName: string): void => {
    void window.electronAPI.invoke('agent:rename', sessionId, displayName).catch((err) => {
      console.error('[App] failed to rename agent:', err)
    })
  }, [])

  const fetchProject = useFetchProject(handleFetchSuccess)
  const overlays = useAppOverlays(gitOps.commit, refreshDiff, spawnAgent, deleteAgent, removeSession, updateSettings, setActiveSession, setActiveProject, activeProjectId)
  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const toggleTheme = useCallback(() => {
    const nextId = themeId.endsWith('-light')
      ? themeId.replace(/-light$/, '-dark')
      : themeId.replace(/-dark$/, '-light')
    void updateSettings({ theme: nextId })
  }, [themeId, updateSettings])
  const themeFamily: 'manifold' | 'garfield' | 'neon' | 'royal' =
    themeId.startsWith('garfield') ? 'garfield'
      : themeId.startsWith('neon') ? 'neon'
        : themeId.startsWith('royal') ? 'royal'
          : 'manifold'
  const selectThemeFamily = useCallback((family: 'manifold' | 'garfield' | 'neon' | 'royal') => {
    const suffix = themeId.endsWith('-light') ? '-light' : '-dark'
    void updateSettings({ theme: `${family}${suffix}` })
  }, [themeId, updateSettings])
  const updateNotification = useUpdateNotification()
  const updateLog = useUpdateLog()
  // Embedded agents are themed at launch, so a light↔dark switch only applies
  // to newly launched agents — tell the user when one is already running.
  const interactiveAgentActive = !!activeSession && !activeSession.nonInteractive
    && (activeSession.status === 'running' || activeSession.status === 'waiting')
  const themeChangeNotice = useThemeChangeNotification(
    themeClass === 'theme-light' ? 'light' : 'dark',
    interactiveAgentActive,
  )
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const shellProjectCwd = activeSession ? (activeProject?.path ?? null) : null
  const shellSessionKey = activeSessionId
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, shellProjectCwd, shellSessionKey, settings.shellPrompt)

  const editorHandlers = useEditorPaneHandlers({
    activeSessionId, activeProjectId, sessionsByProject, projects,
    restoredSessionId: viewState.restoredSessionId,
    codeView, dockLayout, ensureEditorVisible, handleSelectFile, setActiveSession,
    onRequestDeleteAgent: overlays.requestDeleteAgent,
  })

  const addProjectFromOnboarding = useCallback(async (path?: string) => {
    const project = await addProject(path)
    if (project) setActiveWorkspaceId(null)
    return project
  }, [addProject, setActiveWorkspaceId])

  const { handleCreateNewProject, handleAddProjectFromOnboarding, handleCloneFromOnboarding } = useProjectCreateHandlers({
    createNewProject, addProject: addProjectFromOnboarding, cloneProject, spawnAgent, setActiveSession,
    defaultRuntime: settings.defaultRuntime, appEffects,
  })

  // Keep the creating cover up until the freshly spawned agent's chat is on
  // screen, then reveal it — this skips the brief "new agent" overview flash.
  useEffect(() => {
    if (appEffects.creatingProject && activeSession) appEffects.setCreatingProject(false)
  }, [appEffects.creatingProject, activeSession, appEffects.setCreatingProject])

  // Push active workspace context to the plugin host whenever project or session changes.
  useEffect(() => {
    void window.electronAPI.invoke('plugins:set-active-context', {
      project: activeProject ? { id: activeProject.id, name: activeProject.name, path: activeProject.path } : undefined,
      session: activeSession ? { id: activeSession.id, status: activeSession.status, branchName: activeSession.branchName } : undefined,
    })
  }, [activeProject?.id, activeProject?.name, activeProject?.path, activeSession?.id, activeSession?.status, activeSession?.branchName])

  // Mirror the active session id into a ref so the (mount-only) Cmd+P handler
  // reads the current value without re-registering the listener.
  const quickOpenSessionRef = useRef(effectiveSessionId)
  quickOpenSessionRef.current = effectiveSessionId

  // Global Cmd+P opens Quick Open from anywhere (VS Code-style), including while
  // focus is in an input/editor — intentional: this is the primary file-nav gesture.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && (event.key === 'p' || event.key === 'P')) {
        // No worktree to search, or a modal owns the screen — don't open behind it.
        if (!quickOpenSessionRef.current) return
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
        event.preventDefault()
        setQuickOpenVisible(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const activeProjectIsGit = isGitProject(activeProject)
  const baseBranch = activeProjectIsGit ? activeProject?.baseBranch ?? settings.defaultBaseBranch : ''

  const rootLabels = useMemo(() => buildRootLabels({
    primaryTreePath: tree?.path ?? null,
    additionalRootPaths: Array.from(additionalTrees?.keys() ?? []),
    activeSession,
    projects,
  }), [tree?.path, additionalTrees, activeSession, projects])

  const dockState: DockAppState = {
    sessionId: effectiveSessionId, primarySessionId,
    searchFocusRequestKey: appEffects.searchFocusRequestKey, requestedSearchMode: appEffects.requestedSearchMode,
    scrollbackLines: settings.scrollbackLines, terminalFontFamily: settings.terminalFontFamily, xtermTheme, diffText: diff,
    editorSettings: settings.editor,
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
    worktreeRootPath: tree?.path ?? undefined, tree, additionalTrees, additionalBranches, rootLabels,
    primaryBranch: activeSession?.branchName ?? null, changes: mergedChanges,
    expandedPaths: viewState.expandedPaths, onToggleExpand: viewState.onToggleExpand, worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId, projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd,
    shellPrompt: settings.shellPrompt,
    onShellPromptChange: (enabled) => { void updateSettings({ shellPrompt: enabled }) },
    baseBranch, activeProjectIsGit,
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
    onRemoveProject: removeProject, onUpdateProject: updateProject, onRenameAgent: renameAgent, onRequestDeleteAgent: overlays.requestDeleteAgent,
    onNewAgentFromHeader: () => {
      if (activeWorkspaceId) {
        const ws = workspaces.find((w) => w.id === activeWorkspaceId)
        const home = activeProjectId && ws?.projectIds.includes(activeProjectId) ? activeProjectId : ws?.projectIds[0]
        if (home) setActiveProject(home)
        overlays.handleNewAgentFromHeader()
      } else {
        setActiveWorkspaceId(null); overlays.handleNewAgentFromHeader()
      }
    },
    onSelectWorkspaceRepo: (workspaceId: string, projectId: string) => {
      setActiveWorkspaceId(workspaceId); setActiveProject(projectId); setActiveSession(null)
    },
    newAgentFocusTrigger: overlays.newAgentFocusTrigger,
    onNewProject: () => appEffects.setShowOnboarding(true),
    workspaces, activeWorkspaceId, sessionsByWorkspace,
    onNewWorkspace: () => setNewWorkspaceVisible(true),
    onSelectWorkspace: (id: string) => { setActiveWorkspaceId(id) },
    onRemoveWorkspace: async (id: string) => {
      await removeWorkspace(id)
      setActiveWorkspaceId((current) => (current === id ? null : current))
    },
    onLaunchWorkspaceAgent: async (
      workspaceId: string,
      homeProjectId: string,
      options: { runtimeId: string; prompt: string; nonInteractive?: boolean },
    ) => {
      const session = await spawnWorkspaceAgent(workspaceId, {
        runtimeId: options.runtimeId,
        homeProjectId,
        prompt: options.prompt,
        nonInteractive: options.nonInteractive,
      })
      setActiveWorkspaceId(workspaceId); overlays.handleSelectSession(session.id, session.projectId)
      if (options.nonInteractive) {
        try {
          await window.electronAPI.invoke('simple:subscribe-chat', session.id)
        } catch (err) {
          console.error(`[onLaunchWorkspaceAgent] simple:subscribe-chat failed for ${session.id}:`, err)
        }
      }
      return session
    },
    onAddProjectToWorkspace: (id: string) => setAddProjectWorkspaceId(id),
    onRemoveProjectFromWorkspace: (id: string, pid: string) => { void removeProjectFromWorkspace(id, pid) },
    fetchingProjectId: fetchProject.fetchingProjectId, lastFetchedProjectId: fetchProject.lastFetchedProjectId,
    fetchResult: fetchProject.fetchResult, fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject,
    onFocusSearch: appEffects.focusSearch, onClosePanel: editorHandlers.handleClosePanel,
    onOpenModule: (id) => {
      if (dockLayout.isPanelVisible(id)) dockLayout.focusPanel(id)
      else dockLayout.togglePanel(id)
    },
    isModuleOpen: dockLayout.isPanelVisible,
    onOpenPluginView: dockLayout.openPluginView,
    onOpenPluginTreeView: dockLayout.openPluginTreeView,
    onFocusPanel: dockLayout.focusPanel,
    onOpenSibling: dockLayout.openSiblingPanel, onCloseSiblingPanel: dockLayout.closeSiblingPanel,
    activeSessionStatus: activeSession?.status ?? null,
    activeSessionRuntimeId: activeSession?.runtimeId ?? null, onResumeAgent: resumeAgent,
    drafts, activeDraft, promoteDraft, discardDraft,
    favorites, isFavorite, onToggleFavorite: toggleFavorite,
    onReorderFavorites: reorderFavorites, onActivateFavorite: activateFavorite,
  }

  return (
    <>
      <AppShell
        themeClass={themeClass}
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
        themeChangeNotice={themeChangeNotice}
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
        defaultRuntime={settings.defaultRuntime}
        createWorkspace={createWorkspace}
        workspaces={workspaces}
        addProjectWorkspaceId={addProjectWorkspaceId}
        setAddProjectWorkspaceId={setAddProjectWorkspaceId}
        addProjectToWorkspace={addProjectToWorkspace}
        dockLayout={dockLayout}
        onRenameActiveProject={(name) => { if (activeProjectId) void updateProject(activeProjectId, { name }) }}
        onToggleTheme={toggleTheme}
        themeFamily={themeFamily}
        onSelectThemeFamily={selectThemeFamily}
      />
      <QuickOpen
        visible={quickOpenVisible && effectiveSessionId !== null}
        sessionId={effectiveSessionId}
        worktreeRoot={tree?.path ?? null}
        onSelect={(absolutePath) => {
          editorHandlers.handleSelectFileWithDefaultView(absolutePath)
          setQuickOpenVisible(false)
        }}
        onClose={() => setQuickOpenVisible(false)}
      />
    </>
  )
}
