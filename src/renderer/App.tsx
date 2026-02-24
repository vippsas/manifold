import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DockviewReact } from 'dockview'
import { useProjects } from './hooks/useProjects'
import { useAgentSession } from './hooks/useAgentSession'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useDiff } from './hooks/useDiff'
import { useSettings } from './hooks/useSettings'
import { useCodeView } from './hooks/useCodeView'
import { useViewState } from './hooks/useViewState'
import { useShellSessions } from './hooks/useShellSession'
import { useGitOperations } from './hooks/useGitOperations'
import { useAllProjectSessions } from './hooks/useAllProjectSessions'
import { useTheme } from './hooks/useTheme'
import { useSessionStatePersistence } from './hooks/useSessionStatePersistence'
import { useStatusNotification } from './hooks/useStatusNotification'
import { useUpdateNotification } from './hooks/useUpdateNotification'
import { useFileDiff } from './hooks/useFileDiff'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppOverlays } from './hooks/useAppOverlays'
import { useDockLayout, type DockPanelId } from './hooks/useDockLayout'
import { PANEL_COMPONENTS, DockStateContext, type DockAppState } from './components/dock-panels'
import { NewTaskModal } from './components/NewTaskModal'
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
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession } =
    useAgentSession(activeProjectId)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const allSessions = useMemo(() => Object.values(sessionsByProject).flat(), [sessionsByProject])
  useStatusNotification(allSessions, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(activeSessionId)
  const dockLayout = useDockLayout(activeSessionId)
  const codeView = useCodeView(activeSessionId)

  // Listen for View menu → Toggle panel commands from the main process.
  useEffect(() => {
    return window.electronAPI.on('view:toggle-panel', (panelId: unknown) => {
      dockLayout.togglePanel(panelId as DockPanelId)
    })
  }, [dockLayout.togglePanel])

  const handleFilesChanged = useCallback(() => {
    void codeView.refreshOpenFiles()
    void refreshDiff()
  }, [codeView.refreshOpenFiles, refreshDiff])

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

  const handleCloneFromOnboarding = useCallback(async (url: string): Promise<void> => {
    await cloneProject(url)
    setShowOnboarding(false)
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
    changes: mergedChanges,
    expandedPaths: viewState.expandedPaths,
    onToggleExpand: viewState.onToggleExpand,
    worktreeRoot: tree?.path ?? null,
    worktreeShellSessionId: worktreeSessionId,
    projectShellSessionId: projectSessionId,
    worktreeCwd: worktreeShellCwd,
    onNewAgent: (description: string) => { overlays.handleNewAgentWithDescription(description) },
    projects,
    activeProjectId,
    allProjectSessions: sessionsByProject,
    onSelectProject: setActiveProject,
    onSelectSession: overlays.handleSelectSession,
    onRemoveProject: removeProject,
    onUpdateProject: updateProject,
    onDeleteAgent: overlays.handleDeleteAgent,
    onNewAgentForProject: overlays.handleNewAgentForProject,
    onNewProject: () => setShowOnboarding(true),
    onOpenSettings: () => overlays.setShowSettings(true),
  }

  if (!settings.setupCompleted) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <WelcomeDialog
          onAddProject={() => void addProject()}
          onCloneProject={(url) => void cloneProject(url)}
          onComplete={overlays.handleSetupComplete}
        />
      </div>
    )
  }

  if (projects.length === 0 || showOnboarding) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <OnboardingView
          variant="no-project"
          onAddProject={() => void handleAddProjectFromOnboarding()}
          onCloneProject={(url) => void handleCloneFromOnboarding(url)}
          onCreateNewProject={(desc) => void handleCreateNewProject(desc)}
          creatingProject={creatingProject}
          createError={projectError}
          onBack={projects.length > 0 ? () => setShowOnboarding(false) : undefined}
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

      {activeProjectId && (
        <NewTaskModal
          visible={overlays.showNewAgent}
          projectId={activeProjectId}
          baseBranch={activeProject?.baseBranch ?? 'main'}
          defaultRuntime={settings.defaultRuntime}
          onLaunch={overlays.handleLaunchAgent}
          onClose={() => overlays.setShowNewAgent(false)}
          projects={overlays.showProjectPicker ? projects : undefined}
          initialDescription={overlays.initialDescription}
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
