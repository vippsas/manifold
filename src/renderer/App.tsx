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
import { useUpdateNotification } from './hooks/useUpdateNotification'
import { useFileDiff } from './hooks/useFileDiff'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppOverlays } from './hooks/useAppOverlays'
import { useWebPreview } from './hooks/useWebPreview'
import { useDockLayout, type DockPanelId } from './hooks/useDockLayout'
import { PANEL_COMPONENTS, DockStateContext, type DockAppState } from './components/dock-panels'
import { OnboardingView } from './components/OnboardingView'
import { SettingsModal } from './components/SettingsModal'
import { AboutOverlay } from './components/AboutOverlay'
import { UpdateToast } from './components/UpdateToast'
import { StatusBar } from './components/StatusBar'
import { CommitPanel } from './components/CommitPanel'
import { PRPanel } from './components/PRPanel'
import { ConflictPanel } from './components/ConflictPanel'
import { WelcomeDialog } from './components/WelcomeDialog'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, createNewProject, removeProject, updateProject, setActiveProject, error: projectError } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession, resumeAgent } =
    useAgentSession(activeProjectId)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const allSessions = useMemo(() => Object.values(sessionsByProject).flat(), [sessionsByProject])
  useStatusNotification(allSessions, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(activeSessionId)
  const dockLayout = useDockLayout(activeSessionId)
  const webPreview = useWebPreview(activeSessionId)
  const codeView = useCodeView(activeSessionId)

  // Listen for View menu → Toggle panel commands from the main process.
  useEffect(() => {
    return window.electronAPI.on('view:toggle-panel', (panelId: unknown) => {
      dockLayout.togglePanel(panelId as DockPanelId)
    })
  }, [dockLayout.togglePanel])

  // When switching from simple → developer mode, the main process sends the
  // project ID and branch name so we can resume work in an interactive session.
  useEffect(() => {
    return window.electronAPI.on('app:auto-spawn', (...args: unknown[]) => {
      const projectId = args[0] as string | undefined
      const branchName = args[1] as string | undefined
      if (typeof projectId !== 'string') return
      setActiveProject(projectId)
      void spawnAgent({
        projectId,
        runtimeId: settings.defaultRuntime,
        prompt: '',
        existingBranch: branchName,
      })
    })
  }, [setActiveProject, spawnAgent, settings.defaultRuntime])

  // Auto-open web preview panel when a URL is detected
  useEffect(() => {
    const api = dockLayout.apiRef.current
    if (!api) return

    if (webPreview.previewUrl) {
      if (!api.getPanel('webPreview')) {
        const editorPanel = api.getPanel('editor')
        api.addPanel({
          id: 'webPreview',
          component: 'webPreview',
          title: 'Preview',
          position: editorPanel
            ? { referencePanel: editorPanel, direction: 'within' }
            : undefined,
        })
      }
    }
  }, [webPreview.previewUrl, dockLayout.apiRef])

  const handleFilesChanged = useCallback(() => {
    void codeView.refreshOpenFiles()
    void refreshDiff()
  }, [codeView.refreshOpenFiles, refreshDiff])

  const { additionalTrees, additionalBranches } = useAdditionalDirs(activeSessionId)
  const { tree, changes: watcherChanges, deleteFile, renameFile } = useFileWatcher(activeSessionId, handleFilesChanged)

  const { mergedChanges, activeFileDiffText, originalContent } = useFileDiff(
    activeSessionId,
    diff,
    changedFiles,
    watcherChanges,
    codeView.activeFilePath,
    tree?.path ?? null
  )

  const viewState = useViewState(activeSessionId, tree)

  // Editor panel is always considered visible with dockview (panels can be re-added)
  const ensureEditorVisible = useCallback(() => {
    if (!dockLayout.isPanelVisible('editor')) {
      dockLayout.togglePanel('editor')
    }
  }, [dockLayout])

  const { handleSelectFile, handleDeleteFile, handleRenameFile } = useFileOperations(
    viewState.expandAncestors,
    codeView.handleSelectFile,
    codeView.handleCloseFile,
    codeView.handleRenameOpenFile,
    ensureEditorVisible,
    deleteFile,
    renameFile
  )

  useSessionStatePersistence(activeSessionId, viewState, codeView)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const autoGenerateMessages = activeProject?.autoGenerateMessages !== false
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const projectShellCwd = activeProject?.path ?? null
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, projectShellCwd, activeSessionId)

  const gitOps = useGitOperations(activeSessionId)

  const handleFetchSuccess = useCallback((projectId: string) => {
    const projectSessions = sessionsByProject[projectId] ?? []
    for (const session of projectSessions) {
      void window.electronAPI.invoke('git:ahead-behind', session.id).catch(() => {})
    }
    void gitOps.refreshAheadBehind()
  }, [sessionsByProject, gitOps.refreshAheadBehind])

  const fetchProject = useFetchProject(handleFetchSuccess)

  const overlays = useAppOverlays(
    gitOps.commit,
    refreshDiff,
    spawnAgent,
    deleteAgent,
    removeSession,
    updateSettings,
    setActiveSession,
    setActiveProject,
    activeProjectId
  )

  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const updateNotification = useUpdateNotification()
  const [creatingProject, setCreatingProject] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const handleCreateNewProject = useCallback(async (description: string): Promise<void> => {
    setCreatingProject(true)
    try {
      const project = await createNewProject(description)
      if (project) {
        setShowOnboarding(false)
        void spawnAgent({
          projectId: project.id,
          runtimeId: settings.defaultRuntime,
          prompt: description,
        })
      }
    } finally {
      setCreatingProject(false)
    }
  }, [createNewProject, spawnAgent, settings.defaultRuntime])

  const handleAddProjectFromOnboarding = useCallback(async (path?: string): Promise<void> => {
    await addProject(path)
    setShowOnboarding(false)
  }, [addProject])

  const [cloningProject, setCloningProject] = useState(false)

  const handleCloneFromOnboarding = useCallback(async (url: string): Promise<boolean> => {
    setCloningProject(true)
    try {
      const success = await cloneProject(url)
      if (success) {
        setShowOnboarding(false)
      }
      return success
    } finally {
      setCloningProject(false)
    }
  }, [cloneProject])

  // Shared state object that dock panels read via context
  const dockState: DockAppState = {
    sessionId: activeSessionId,
    scrollbackLines: settings.scrollbackLines,
    terminalFontFamily: settings.terminalFontFamily,
    xtermTheme,
    fileDiffText: activeFileDiffText,
    originalContent,
    openFiles: codeView.openFiles,
    activeFilePath: codeView.activeFilePath,
    fileContent: codeView.activeFileContent,
    theme: themeId,
    onSelectFile: handleSelectFile,
    onCloseFile: codeView.handleCloseFile,
    onSaveFile: codeView.handleSaveFile,
    onDeleteFile: handleDeleteFile,
    onRenameFile: handleRenameFile,
    tree,
    additionalTrees,
    additionalBranches,
    primaryBranch: activeSession?.branchName ?? null,
    changes: mergedChanges,
    expandedPaths: viewState.expandedPaths,
    onToggleExpand: viewState.onToggleExpand,
    worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId,
    projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd,
    baseBranch: activeProject?.baseBranch ?? settings.defaultBaseBranch,
    defaultRuntime: settings.defaultRuntime,
    onLaunchAgent: overlays.handleLaunchAgent,
    projects,
    activeProjectId,
    allProjectSessions: sessionsByProject,
    onSelectProject: setActiveProject,
    onSelectSession: overlays.handleSelectSession,
    onRemoveProject: removeProject,
    onUpdateProject: updateProject,
    onDeleteAgent: overlays.handleDeleteAgent,
    onNewAgentFromHeader: overlays.handleNewAgentFromHeader,
    newAgentFocusTrigger: overlays.newAgentFocusTrigger,
    onNewProject: () => setShowOnboarding(true),
    fetchingProjectId: fetchProject.fetchingProjectId,
    lastFetchedProjectId: fetchProject.lastFetchedProjectId,
    fetchResult: fetchProject.fetchResult,
    fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject,
    // Web preview
    previewUrl: webPreview.previewUrl,
    // Agent restart
    activeSessionStatus: activeSession?.status ?? null,
    activeSessionRuntimeId: activeSession?.runtimeId ?? null,
    onResumeAgent: resumeAgent,
  }

  if (!settings.setupCompleted) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <WelcomeDialog
          onAddProject={() => void addProject()}
          onCloneProject={cloneProject}
          onComplete={overlays.handleSetupComplete}
        />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <OnboardingView
          variant="no-project"
          onAddProject={() => void handleAddProjectFromOnboarding()}
          onCloneProject={handleCloneFromOnboarding}
          onCreateNewProject={(desc) => void handleCreateNewProject(desc)}
          creatingProject={creatingProject}
          cloningProject={cloningProject}
          createError={projectError}
        />
      </div>
    )
  }

  return (
    <div className={`layout-root ${themeClass}`}>
      <div className="layout-main">
        <DockStateContext.Provider value={dockState}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DockviewReact
              className={`dockview-theme-dark dockview-theme-manifold${!activeSessionId ? ' dockview-minimal' : ''}`}
              components={PANEL_COMPONENTS}
              onReady={(e) => dockLayout.onReady(e.api)}
              defaultTabComponent={DockTab}
              watermarkComponent={EmptyWatermark}
            />
          </div>
        </DockStateContext.Provider>

        <StatusBar
          activeSession={activeSession}
          changedFiles={mergedChanges}
          baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
          dockLayout={dockLayout}
          conflicts={gitOps.conflicts}
          aheadBehind={gitOps.aheadBehind}
          onCommit={() => overlays.setActivePanel('commit')}
          onCreatePR={() => overlays.setActivePanel('pr')}
          onShowConflicts={() => overlays.setActivePanel('conflicts')}
          onOpenSettings={() => overlays.setShowSettings(true)}
        />
      </div>

      {overlays.activePanel === 'commit' && activeSessionId && (
        <CommitPanel
          changedFiles={mergedChanges}
          diff={diff}
          autoGenerateMessages={autoGenerateMessages}
          onCommit={overlays.handleCommit}
          onAiGenerate={gitOps.aiGenerate}
          onClose={overlays.handleClosePanel}
        />
      )}

      {overlays.activePanel === 'pr' && activeSessionId && activeSession && (
        <PRPanel
          sessionId={activeSessionId}
          branchName={activeSession.branchName}
          baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
          autoGenerateMessages={autoGenerateMessages}
          onAiGenerate={gitOps.aiGenerate}
          getPRContext={gitOps.getPRContext}
          onClose={overlays.handleClosePanel}
        />
      )}

      {overlays.activePanel === 'conflicts' && activeSessionId && (
        <ConflictPanel
          sessionId={activeSessionId}
          conflicts={gitOps.conflicts}
          onAiGenerate={gitOps.aiGenerate}
          onResolveConflict={gitOps.resolveConflict}
          onSelectFile={handleSelectFile}
          onClose={overlays.handleClosePanel}
        />
      )}

      <SettingsModal
        visible={overlays.showSettings}
        settings={settings}
        onSave={overlays.handleSaveSettings}
        onClose={() => overlays.setShowSettings(false)}
        onPreviewTheme={setPreviewThemeId}
      />

      <AboutOverlay
        visible={overlays.showAbout}
        version={overlays.appVersion}
        onClose={() => overlays.setShowAbout(false)}
      />

      {updateNotification.updateReady && (
        <UpdateToast
          version={updateNotification.version}
          onRestart={updateNotification.install}
          onDismiss={updateNotification.dismiss}
        />
      )}

      {showOnboarding && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-primary)' }}>
          <OnboardingView
            variant="no-project"
            onAddProject={() => void handleAddProjectFromOnboarding()}
            onCloneProject={handleCloneFromOnboarding}
            onCreateNewProject={(desc) => void handleCreateNewProject(desc)}
            creatingProject={creatingProject}
            cloningProject={cloningProject}
            createError={projectError}
            onBack={() => setShowOnboarding(false)}
          />
        </div>
      )}

    </div>
  )
}

function DockTab({ api }: { api: { title: string; close: () => void } }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      <span>{api.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); api.close() }}
        style={{
          fontSize: '11px',
          lineHeight: 1,
          color: 'var(--text-muted)',
          padding: '0 2px',
          cursor: 'pointer',
          opacity: 0.6,
        }}
        title={`Close ${api.title}`}
      >
        &times;
      </button>
    </div>
  )
}

function EmptyWatermark(): React.JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-muted)', fontSize: '12px',
    }}>
      Drag a panel here
    </div>
  )
}
