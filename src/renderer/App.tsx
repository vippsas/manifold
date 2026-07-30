import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProjects } from './hooks/project/useProjects'
import { useAgentSession } from './hooks/agent-session/useAgentSession'
import { useFileWatcher } from './hooks/editor/useFileWatcher'
import { useAdditionalDirs } from './hooks/project/useAdditionalDirs'
import { useDiff } from './hooks/editor/useDiff'
import { useSettings } from './hooks/settings/useSettings'
import { useCodeView } from './hooks/editor/useCodeView'
import { useViewState } from './hooks/editor/useViewState'
import { useShellSessions } from './hooks/terminal/useShellSession'
import { useGitOperations } from './hooks/editor/useGitOperations'
import { useBranchStaleness } from './hooks/project/useBranchStaleness'
import { useAllProjectSessions } from './hooks/agent-session/useAllProjectSessions'
import { useTheme } from './hooks/theme/useTheme'
import { useThemeChangeNotification } from './hooks/theme/useThemeChangeNotification'
import { useSessionStatePersistence } from './hooks/agent-session/useSessionStatePersistence'
import { useStatusNotification } from './hooks/app/useStatusNotification'
import { useUpdateLog } from '../shared/useUpdateLog'
import { useUpdateNotification } from '../shared/useUpdateNotification'
import { mergeFileChanges } from './hooks/editor/useFileDiff'
import { useFileOperations } from './hooks/editor/useFileOperations'
import { useAppOverlays } from './hooks/app/useAppOverlays'
import { useDraftChatCoordinator } from './hooks/agent-session/useDraftChatCoordinator'
import { useEditorPaneHandlers } from './hooks/editor/useEditorPaneHandlers'
import { useAutoSelectActiveProject } from './hooks/project/useAutoSelectActiveProject'
import { useProjectCreateHandlers } from './hooks/project/useProjectCreateHandlers'
import { useDockLayout } from './hooks/dock-layout/useDockLayout'
import { useSidebarHandleCycle } from './hooks/dock-layout/useSidebarHandleCycle'
import { useAgentSiblingDockTabs } from './hooks/agent-session/useAgentSiblingDockTabs'
import { getPrimarySession } from './hooks/agent-session/agent-siblings'
import { useAppEffects } from './hooks/app/useAppEffects'
import { useCommands } from './hooks/app/useCommands'
import { cycleAgent } from './commands/agent-cycle'
import type { CommandContext } from './commands/command-handlers'
import type { DockPanelId } from './hooks/dock-layout/useDockLayout'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import { buildRootLabels } from './components/editor/file-tree/file-tree-labels'
import { useWorkspaces } from './hooks/project/useWorkspaces'
import { useFavorites } from './hooks/project/useFavorites'
import type { AgentSession, AgentSettingsUpdate, ResolvedFavorite } from '../shared/types'
import { isGitProject } from '../shared/project-kind'
import { clampUiScale } from '../shared/defaults'
import { AppShell, type NewAgentTarget } from './AppShell'
import { QuickOpen } from './components/editor/quick-open/QuickOpen'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()

  useLayoutEffect(() => {
    const scale = clampUiScale(settings.uiScale)
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    document.dispatchEvent(new CustomEvent('manifold:ui-scale-changed', { detail: scale }))
  }, [settings.uiScale])

  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds, rememberedActiveSessionRef } = useAgentSession(activeProjectId)
  const { drafts, activeDraft, effectiveSessionId, createDraft, discardDraft, promoteDraft } = useDraftChatCoordinator(activeSessionId, setActiveSession, spawnAgent)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const { workspaces, createWorkspace, removeWorkspace, addProject: addProjectToWorkspace, removeProject: removeProjectFromWorkspace, spawnAgent: spawnWorkspaceAgent } = useWorkspaces()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [newAgentTarget, setNewAgentTarget] = useState<NewAgentTarget | null>(null)
  const visibleWorkspaces = useMemo(
    () => (settings.workspacesEnabled ? workspaces : []),
    [settings.workspacesEnabled, workspaces],
  )
  const { favorites, isFavorite, toggleFavorite, reorderFavorites } = useFavorites(
    settings, updateSettings, projects, visibleWorkspaces,
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
      const ws = visibleWorkspaces.find((w) => w.id === fav.id)
      setActiveWorkspaceId(fav.id)
      if (ws && ws.projectIds[0]) setActiveProject(ws.projectIds[0])
      setActiveSession(null)
    }
  }, [visibleWorkspaces, setActiveProject, setActiveSession])
  const jumpToFavorite = useCallback((index: number): void => {
    const fav = favorites[index]
    if (fav) activateFavorite(fav)
  }, [favorites, activateFavorite])
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [newWorkspaceVisible, setNewWorkspaceVisible] = useState(false)
  const suppressedProjectIds = useMemo(
    () => new Set(visibleWorkspaces.flatMap((workspace) => workspace.projectIds)),
    [visibleWorkspaces],
  )
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

  useEffect(() => {
    if (!settings.workspacesEnabled) setActiveWorkspaceId(null)
  }, [settings.workspacesEnabled])

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
  // Only the double-click width-cycle gesture remains in use; the header
  // collapse buttons were removed (closing a panel replaces collapsing).
  useSidebarHandleCycle(dockLayout.apiRef, settings.sidebarResizeReversed)
  useAgentSiblingDockTabs({
    apiRef: dockLayout.apiRef, layoutVersion: dockLayout.layoutVersion,
    layoutReloadVersion: dockLayout.layoutReloadVersion, isRestoringRef: dockLayout.isRestoringRef,
    rememberedActiveSessionRef,
    sessions: activeProjectSessions, activeWorktreePath, primarySessionId, activeSessionId,
    disabled: false, onSelectSession: setActiveSession,
  })
  const codeView = useCodeView(effectiveSessionId)
  const appEffects = useAppEffects({
    activeSessionId, dockLayout, settings,
    setActiveProject, setActiveSession, spawnAgent, refreshOpenFiles: codeView.refreshOpenFiles, refreshDiff,
  })
  const { additionalDirs, additionalTrees, additionalBranches, refreshTree: refreshAdditionalTree } = useAdditionalDirs(effectiveSessionId, activeSession?.additionalDirs)
  const { tree, changes: watcherChanges, refreshTree: refreshPrimaryTree, deleteFile, renameFile, createFile, createDir, importPaths, pasteImage, pasteClipboardImage, movePath, revealInFinder, openInTerminal } = useFileWatcher(effectiveSessionId, appEffects.handleFilesChanged, activeDraft?.projectId ?? null)
  const mergedChanges = useMemo(() => mergeFileChanges(changedFiles, watcherChanges), [changedFiles, watcherChanges])
  const viewState = useViewState(effectiveSessionId, tree)
  const handleRefreshFileTree = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshPrimaryTree(),
      ...additionalDirs.map((dir) => refreshAdditionalTree(dir)),
    ])
  }, [additionalDirs, refreshAdditionalTree, refreshPrimaryTree])

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
  useBranchStaleness(activeProjectId, projects)

  const renameAgent = useCallback(async (sessionId: string, update: AgentSettingsUpdate): Promise<void> => {
    const configured = await window.electronAPI.invoke('agent:configure', sessionId, update) as AgentSession
    setActiveWorkspaceId(settings.workspacesEnabled ? (configured.workspaceId ?? null) : null)
    setActiveProject(configured.projectId)
    setActiveSession(configured.id)
  }, [setActiveProject, setActiveSession, settings.workspacesEnabled])

  const overlays = useAppOverlays(gitOps.commit, refreshDiff, spawnAgent, deleteAgent, removeSession, updateSettings, setActiveSession, setActiveProject, activeProjectId)
  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const toggleTheme = useCallback(() => {
    const nextId = themeId.endsWith('-light')
      ? themeId.replace(/-light$/, '-dark')
      : themeId.replace(/-dark$/, '-light')
    void updateSettings({ theme: nextId })
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
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, shellProjectCwd, shellSessionKey)

  const editorHandlers = useEditorPaneHandlers({
    activeSessionId, activeProjectId, sessionsByProject, projects,
    restoredSessionId: viewState.restoredSessionId,
    codeView, dockLayout, ensureEditorVisible, handleSelectFile, setActiveSession,
    onRequestDeleteAgent: overlays.requestDeleteAgent,
  })

  // Adding a repo from onboarding while a workspace is focused must clear that
  // workspace. ProjectList nulls out the active project whenever a workspace is
  // active (a workspace and a standalone repo must not look selected at once), so a
  // left-focused workspace pushes the new repo into the collapsed "Repositories"
  // list with no create-agent affordance. Clearing it surfaces the new repo as the
  // pinned active card across every add path — local add, clone, create-new (#811).
  const clearActiveWorkspace = useCallback(() => setActiveWorkspaceId(null), [setActiveWorkspaceId])

  const { handleCreateNewProject, handleAddProjectFromOnboarding, handleCloneFromOnboarding } = useProjectCreateHandlers({
    createNewProject, addProject, cloneProject, spawnAgent, setActiveSession, clearActiveWorkspace,
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

  // Mirror the active session id into a ref so the openQuickOpen command reads
  // the current value without being rebuilt on every session change.
  const quickOpenSessionRef = useRef(effectiveSessionId)
  quickOpenSessionRef.current = effectiveSessionId

  // The Quick Open File command (Cmd+P) opens from anywhere — including while
  // focus is in an input/editor — but not when there's no worktree to search or
  // when a modal already owns the screen.
  const openQuickOpen = useCallback((): void => {
    if (!quickOpenSessionRef.current) return
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
    setQuickOpenVisible(true)
  }, [])

  const activeProjectIsGit = isGitProject(activeProject)
  const baseBranch = activeProjectIsGit ? activeProject?.baseBranch ?? settings.defaultBaseBranch : ''

  const rootLabels = useMemo(() => buildRootLabels({
    primaryTreePath: tree?.path ?? null,
    additionalRootPaths: Array.from(additionalTrees?.keys() ?? []),
    activeSession,
    projects,
  }), [tree?.path, additionalTrees, activeSession, projects])

  const openNewAgentModal = useCallback((projectId?: string, workspaceId?: string): void => {
    const targetWorkspaceId = settings.workspacesEnabled ? (workspaceId ?? activeWorkspaceId) : null
    if (targetWorkspaceId) {
      const workspace = workspaces.find((candidate) => candidate.id === targetWorkspaceId)
      const homeProjectId = projectId && workspace?.projectIds.includes(projectId)
        ? projectId
        : activeProjectId && workspace?.projectIds.includes(activeProjectId)
          ? activeProjectId
          : workspace?.projectIds[0]
      setActiveWorkspaceId(targetWorkspaceId)
      if (homeProjectId) {
        setActiveProject(homeProjectId)
        setNewAgentTarget({ projectId: homeProjectId, workspaceId: targetWorkspaceId })
      }
      return
    }

    setActiveWorkspaceId(null)
    const targetProjectId = projectId ?? activeProjectId
    if (targetProjectId) {
      setActiveProject(targetProjectId)
      setNewAgentTarget({ projectId: targetProjectId })
    }
  }, [activeProjectId, activeWorkspaceId, settings.workspacesEnabled, setActiveProject, workspaces])

  const addLocalFolderToWorkspace = useCallback(async (workspaceId: string): Promise<void> => {
    const project = await addProject(undefined, { activate: false })
    if (project) await addProjectToWorkspace(workspaceId, project.id)
  }, [addProject, addProjectToWorkspace])

  const createWorkspaceFromProject = useCallback(async (projectId: string): Promise<void> => {
    const homeProject = projects.find((candidate) => candidate.id === projectId)
    if (!homeProject) return
    const addedProject = await addProject(undefined, { activate: false })
    if (!addedProject || addedProject.id === homeProject.id) return
    const workspace = await createWorkspace({
      name: homeProject.name,
      projectIds: [homeProject.id, addedProject.id],
      runtimeId: settings.defaultRuntime,
    })
    if (!settings.workspacesEnabled) {
      await updateSettings({ workspacesEnabled: true })
    }
    setActiveWorkspaceId(workspace.id)
    setActiveProject(homeProject.id)
  }, [addProject, createWorkspace, projects, setActiveProject, settings.defaultRuntime, settings.workspacesEnabled, updateSettings])

  const dockState: DockAppState = {
    sessionId: effectiveSessionId, primarySessionId,
    onOpenDashboard: (cardId?: string) => { overlays.setDashboardInitialCard(cardId ?? null); overlays.setShowDashboard(true) },
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
    onCloseFile: codeView.handleCloseFile, onCloseOtherFiles: codeView.handleCloseOtherFiles, onCloseAllFiles: codeView.handleCloseAllFiles,
    onSaveFile: codeView.handleSaveFile, onRegisterEditorPane: codeView.registerPane,
    onActivateEditorPane: editorHandlers.handleActivateEditorPane,
    onSplitEditorPane: editorHandlers.handleSplitEditorPane,
    onMoveFileToPane: editorHandlers.handleMoveFileToPane,
    onMoveFileToSplitPane: editorHandlers.handleMoveFileToSplitPane,
    onDeleteFile: handleDeleteFile, onRenameFile: handleRenameFile,
    onCreateFile: handleCreateFile, onCreateDir: handleCreateDir, onRefreshFileTree: handleRefreshFileTree, onImportPaths: handleImportPaths, onPasteImage: pasteImage, onPasteClipboardImage: pasteClipboardImage, onMovePath: handleMovePath,
    onRevealInFinder: handleRevealInFinder, onOpenInTerminal: handleOpenInTerminal,
    onCopyAbsolutePath: handleCopyAbsolutePath, onCopyRelativePath: handleCopyRelativePath,
    worktreeRootPath: tree?.path ?? undefined, tree, additionalTrees, additionalBranches, rootLabels,
    primaryBranch: activeSession?.branchName ?? null, changes: mergedChanges,
    expandedPaths: viewState.expandedPaths, onToggleExpand: viewState.onToggleExpand, worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId, projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd,
    baseBranch, activeProjectIsGit,
    defaultRuntime: settings.defaultRuntime, defaultAgentMode: settings.defaultAgentMode ?? 'interactive',
    defaultUseWorktrees: settings.useWorktrees ?? true,
    activeSessionWorktreePath: activeSession?.worktreePath ?? null,
    activeSessionNoWorktree: activeSession?.noWorktree ?? false,
    onLaunchAgent: overlays.handleLaunchAgent, projects, activeProjectId, suppressedProjectIds,
    allProjectSessions: sessionsByProject, outputtingSessionIds,
    onSelectProject: (id: string) => { setActiveWorkspaceId(null); setActiveProject(id) },
    onSelectSession: (sessionId: string, projectId: string) => {
      setActiveWorkspaceId(settings.workspacesEnabled ? (workspaceIdBySession[sessionId] ?? null) : null)
      overlays.handleSelectSession(sessionId, projectId)
    },
    onRemoveProject: removeProject, onUpdateProject: updateProject, onRenameAgent: renameAgent, onRequestDeleteAgent: overlays.requestDeleteAgent,
    onNewAgentFromHeader: openNewAgentModal,
    onSelectWorkspaceRepo: (workspaceId: string, projectId: string) => {
      setActiveWorkspaceId(workspaceId); setActiveProject(projectId); setActiveSession(null)
    },
    onNewProject: () => appEffects.setShowOnboarding(true),
    onCreateWorkspaceFromProject: createWorkspaceFromProject,
    workspaces: settings.workspacesEnabled ? workspaces : undefined,
    activeWorkspaceId: settings.workspacesEnabled ? activeWorkspaceId : null,
    sessionsByWorkspace,
    onNewWorkspace: settings.workspacesEnabled ? () => setNewWorkspaceVisible(true) : undefined,
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
    onAddProjectToWorkspace: addLocalFolderToWorkspace,
    onRemoveProjectFromWorkspace: (id: string, pid: string) => { void removeProjectFromWorkspace(id, pid) },
    onFocusSearch: overlays.openSearch, onClosePanel: editorHandlers.handleClosePanel,
    onToggleMaximize: dockLayout.toggleMaximizePanel,
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

  // Wire the command catalog to the functions assembled above. Handlers no-op
  // when their context is absent (e.g. Next Agent with no project) rather than
  // disabling the menu item — see the command-registry design spec.
  const commandContext = useMemo<CommandContext>(() => ({
    openSettings: () => overlays.setShowSettings(true),
    openCommandPalette: () => overlays.setShowCommandPalette(true),
    openShortcuts: () => overlays.setShowShortcuts(true),
    openAbout: () => overlays.setShowAbout(true),
    openQuickOpen,
    findInFiles: () => overlays.openSearch('code'),
    jumpToFavorite,
    newAgent: () => openNewAgentModal(),
    nextAgent: () => {
      const next = cycleAgent(activeProjectSessions, activeSessionId, 1)
      if (next) overlays.handleSelectSession(next.id, next.projectId)
    },
    previousAgent: () => {
      const prev = cycleAgent(activeProjectSessions, activeSessionId, -1)
      if (prev) overlays.handleSelectSession(prev.id, prev.projectId)
    },
    deleteActiveAgent: () => {
      if (activeSession && activeProject) overlays.requestDeleteAgent(activeSession, activeProject.path)
    },
    commit: () => overlays.setActivePanel('commit'),
    createPR: () => overlays.setActivePanel('pr'),
    togglePanel: (panelId) => dockLayout.togglePanel(panelId as DockPanelId),
    openModule: (panelId) => {
      const id = panelId as DockPanelId
      if (dockLayout.isPanelVisible(id)) dockLayout.focusPanel(id)
      else dockLayout.togglePanel(id)
    },
    toggleTheme,
    openDashboard: () => { overlays.setDashboardInitialCard(null); overlays.setShowDashboard(true) },
  }), [overlays, openQuickOpen, openNewAgentModal, appEffects, jumpToFavorite, activeProjectSessions, activeSessionId, activeSession, activeProject, dockLayout, toggleTheme])
  const { runCommand } = useCommands(commandContext)

  return (
    <>
      <AppShell
        runCommand={runCommand}
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
        newAgentTarget={newAgentTarget}
        closeNewAgentModal={() => setNewAgentTarget(null)}
        newWorkspaceVisible={newWorkspaceVisible}
        setNewWorkspaceVisible={setNewWorkspaceVisible}
        defaultRuntime={settings.defaultRuntime}
        createWorkspace={createWorkspace}
        workspaces={workspaces}
        dockLayout={dockLayout}
        onRenameActiveProject={(name) => { if (activeProjectId) void updateProject(activeProjectId, { name }) }}
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
