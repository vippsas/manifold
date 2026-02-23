import React, { useCallback, useMemo } from 'react'
import { useProjects } from './hooks/useProjects'
import { useAgentSession } from './hooks/useAgentSession'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useDiff } from './hooks/useDiff'
import { useSettings } from './hooks/useSettings'
import { usePaneResize } from './hooks/usePaneResize'
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
import { ProjectSidebar } from './components/ProjectSidebar'
import { MainPanes } from './components/MainPanes'
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
  const paneResize = usePaneResize()
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

  const { handleSelectFile, handleDeleteFile, handleRenameFile } = useFileOperations(
    viewState.expandAncestors,
    codeView.handleSelectFile,
    codeView.handleCloseFile,
    codeView.handleRenameOpenFile,
    paneResize.paneVisibility.center,
    paneResize.togglePane,
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

  const sidebarVisible = paneResize.paneVisibility.sidebar

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
            onClose={() => paneResize.togglePane('sidebar')}
          />

          <div
            className="sidebar-divider"
            onMouseDown={handleSidebarDividerMouseDown}
          />
        </>
      ) : (
        <div
          className="sidebar-collapsed"
          onClick={() => paneResize.togglePane('sidebar')}
          title="Expand sidebar"
        >
          <span className="sidebar-collapsed-arrow">{'\u25B6'}</span>
        </div>
      )}

      <div className="layout-main">
        <MainPanes
          panesRef={paneResize.panesRef}
          rightAreaRef={paneResize.rightAreaRef}
          leftPaneFraction={paneResize.leftPaneFraction}
          centerFraction={paneResize.centerFraction}
          rightPaneFraction={paneResize.rightPaneFraction}
          bottomPaneFraction={paneResize.bottomPaneFraction}
          handleDividerMouseDown={paneResize.handleDividerMouseDown}
          paneVisibility={paneResize.paneVisibility}
          onClosePane={paneResize.togglePane}
          fileTreeVisible={paneResize.fileTreeVisible}
          onCloseFileTree={paneResize.toggleFileTree}
          modifiedFilesVisible={paneResize.modifiedFilesVisible}
          onCloseModifiedFiles={paneResize.toggleModifiedFiles}
          fileTreeSplitFraction={paneResize.fileTreeSplitFraction}
          rightPaneRef={paneResize.rightPaneRef}
          worktreeRoot={tree?.path ?? null}
          sessionId={activeSessionId}
          worktreeShellSessionId={worktreeSessionId}
          projectShellSessionId={projectSessionId}
          worktreeCwd={worktreeShellCwd}
          scrollbackLines={settings.scrollbackLines}
          terminalFontFamily={settings.terminalFontFamily}
          fileDiffText={activeFileDiffText}
          originalContent={originalContent}
          openFiles={codeView.openFiles}
          activeFilePath={codeView.activeFilePath}
          fileContent={codeView.activeFileContent}
          theme={themeId}
          xtermTheme={xtermTheme}
          tree={tree}
          changes={mergedChanges}
          onNewAgent={() => { overlays.setShowProjectPicker(true); overlays.setShowNewAgent(true) }}
          onSelectFile={handleSelectFile}
          onCloseFile={codeView.handleCloseFile}
          onSaveFile={codeView.handleSaveFile}
          onDeleteFile={handleDeleteFile}
          onRenameFile={handleRenameFile}
          expandedPaths={viewState.expandedPaths}
          onToggleExpand={viewState.onToggleExpand}
        />

        <StatusBar
          activeSession={activeSession}
          changedFiles={mergedChanges}
          baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
          paneVisibility={paneResize.paneVisibility}
          onTogglePane={paneResize.togglePane}
          fileTreeVisible={paneResize.fileTreeVisible}
          onToggleFileTree={paneResize.toggleFileTree}
          modifiedFilesVisible={paneResize.modifiedFilesVisible}
          onToggleModifiedFiles={paneResize.toggleModifiedFiles}
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
