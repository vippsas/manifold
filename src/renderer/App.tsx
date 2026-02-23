import React, { useCallback, useMemo } from 'react'
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
import { useSidebarResize } from './hooks/useSidebarResize'
import { useSessionStatePersistence } from './hooks/useSessionStatePersistence'
import { useStatusNotification } from './hooks/useStatusNotification'
import { useFileDiff } from './hooks/useFileDiff'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppOverlays } from './hooks/useAppOverlays'
import { useDockLayout } from './hooks/useDockLayout'
import { PANEL_COMPONENTS, DockStateContext, type DockAppState } from './components/dock-panels'
import { ProjectSidebar } from './components/ProjectSidebar'
import { NewTaskModal } from './components/NewTaskModal'
import { OnboardingView } from './components/OnboardingView'
import { SettingsModal } from './components/SettingsModal'
import { AboutOverlay } from './components/AboutOverlay'
import { StatusBar } from './components/StatusBar'
import { CommitPanel } from './components/CommitPanel'
import { PRPanel } from './components/PRPanel'
import { ConflictPanel } from './components/ConflictPanel'
import { WelcomeDialog } from './components/WelcomeDialog'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, removeProject, updateProject, setActiveProject } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession } =
    useAgentSession(activeProjectId)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
  const allSessions = useMemo(() => Object.values(sessionsByProject).flat(), [sessionsByProject])
  useStatusNotification(allSessions, settings.notificationSound)
  const { diff, changedFiles, refreshDiff } = useDiff(activeSessionId)
  const dockLayout = useDockLayout(activeSessionId)
  const codeView = useCodeView(activeSessionId)

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
    true, // centerVisible — always true, we use ensureEditorVisible instead
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
  const { sidebarWidth, handleSidebarDividerMouseDown } = useSidebarResize()
  const [sidebarVisible, setSidebarVisible] = React.useState(true)

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
    onNewAgent: () => { overlays.setShowProjectPicker(true); overlays.setShowNewAgent(true) },
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

  if (projects.length === 0) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <OnboardingView
          variant="no-project"
          onAddProject={() => void addProject()}
          onCloneProject={(url) => void cloneProject(url)}
        />
      </div>
    )
  }

  return (
    <div className={`layout-root ${themeClass}`}>
      {sidebarVisible ? (
        <>
          <ProjectSidebar
            width={sidebarWidth}
            projects={projects}
            activeProjectId={activeProjectId}
            allProjectSessions={sessionsByProject}
            activeSessionId={activeSessionId}
            onSelectProject={setActiveProject}
            onSelectSession={overlays.handleSelectSession}
            onAddProject={addProject}
            onRemoveProject={removeProject}
            onUpdateProject={updateProject}
            onCloneProject={(url: string) => void cloneProject(url)}
            onDeleteAgent={overlays.handleDeleteAgent}
            onNewAgent={overlays.handleNewAgentForProject}
            onOpenSettings={() => overlays.setShowSettings(true)}
            onClose={() => setSidebarVisible(false)}
          />

          <div
            className="sidebar-divider"
            onMouseDown={handleSidebarDividerMouseDown}
          />
        </>
      ) : (
        <div
          className="sidebar-collapsed"
          onClick={() => setSidebarVisible(true)}
          title="Expand sidebar"
        >
          <span className="sidebar-collapsed-arrow">{'\u25B6'}</span>
        </div>
      )}

      <div className="layout-main">
        <DockStateContext.Provider value={dockState}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DockviewReact
              className="dockview-theme-dark dockview-theme-manifold"
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
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
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
          projectName={activeProject?.name ?? ''}
          baseBranch={activeProject?.baseBranch ?? 'main'}
          defaultRuntime={settings.defaultRuntime}
          onLaunch={overlays.handleLaunchAgent}
          onClose={() => overlays.setShowNewAgent(false)}
          projects={overlays.showProjectPicker ? projects : undefined}
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
    </div>
  )
}

function DockTab({ api }: { api: { title: string } }): React.JSX.Element {
  return (
    <div style={{ padding: '0 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {api.title}
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
