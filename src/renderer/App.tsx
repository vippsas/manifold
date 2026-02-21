import React, { useState, useCallback, useMemo } from 'react'
import type { SpawnAgentOptions, FileChange } from '../shared/types'
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
import { ProjectSidebar } from './components/ProjectSidebar'
import { MainPanes } from './components/MainPanes'
import { NewTaskModal } from './components/NewTaskModal'
import { OnboardingView } from './components/OnboardingView'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { CommitPanel } from './components/CommitPanel'
import { PRPanel } from './components/PRPanel'
import { ConflictPanel } from './components/ConflictPanel'
import { WelcomeDialog } from './components/WelcomeDialog'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, removeProject, setActiveProject } = useProjects()
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

  const { tree, changes: watcherChanges } = useFileWatcher(activeSessionId, handleFilesChanged)

  // Merge both change sources: useDiff (committed changes vs base branch) and
  // useFileWatcher (uncommitted changes from git status polling). The watcher
  // changes update every 2s via polling while diff changes require an async IPC
  // round-trip, so merging ensures the file tree shows indicators immediately.
  const mergedChanges = useMemo(() => {
    const map = new Map<string, FileChange>()
    for (const c of changedFiles) map.set(c.path, c)
    for (const c of watcherChanges) map.set(c.path, c)
    return Array.from(map.values())
  }, [changedFiles, watcherChanges])

  const viewState = useViewState(activeSessionId, tree)

  const handleSelectFile = useCallback(
    (filePath: string): void => {
      viewState.expandAncestors(filePath)
      codeView.handleSelectFile(filePath)
      if (!paneResize.paneVisibility.center) {
        paneResize.togglePane('center')
      }
    },
    [viewState.expandAncestors, codeView.handleSelectFile, paneResize.paneVisibility.center, paneResize.togglePane]
  )

  useSessionStatePersistence(activeSessionId, viewState, codeView)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const projectShellCwd = activeProject?.path ?? null
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, projectShellCwd, activeSessionId)

  const gitOps = useGitOperations(activeSessionId)

  const [activePanel, setActivePanel] = useState<'commit' | 'pr' | 'conflicts' | null>(null)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)
  const { sidebarWidth, handleSidebarDividerMouseDown } = useSidebarResize()

  const handleCommit = useCallback(async (message: string): Promise<void> => {
    await gitOps.commit(message)
    void refreshDiff()
    setActivePanel(null)
  }, [gitOps.commit, refreshDiff])

  const handleClosePanel = useCallback((): void => { setActivePanel(null) }, [])

  const handleLaunchAgent = useCallback((options: SpawnAgentOptions): void => {
    void spawnAgent(options)
    setShowNewAgent(false)
  }, [spawnAgent])

  const handleDeleteAgent = useCallback((sessionId: string): void => {
    void deleteAgent(sessionId)
    removeSession(sessionId)
    void window.electronAPI.invoke('view-state:delete', sessionId)
  }, [deleteAgent, removeSession])

  const handleSelectSession = useCallback((sessionId: string, projectId: string): void => {
    setActiveSession(sessionId)
    if (projectId !== activeProjectId) setActiveProject(projectId)
  }, [activeProjectId, setActiveSession, setActiveProject])

  const handleNewAgentForProject = useCallback((projectId: string): void => {
    if (projectId !== activeProjectId) setActiveProject(projectId)
    setShowNewAgent(true)
  }, [activeProjectId, setActiveProject])

  const handleSaveSettings = useCallback((partial: Partial<typeof settings>): void => {
    void updateSettings(partial)
  }, [updateSettings])

  const handleSetupComplete = useCallback((): void => {
    void updateSettings({ setupCompleted: true })
  }, [updateSettings])

  if (!settings.setupCompleted) {
    return (
      <div className={`layout-root ${themeClass}`}>
        <WelcomeDialog
          onAddProject={() => void addProject()}
          onCloneProject={(url) => void cloneProject(url)}
          onComplete={handleSetupComplete}
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
            onSelectSession={handleSelectSession}
            onAddProject={addProject}
            onRemoveProject={removeProject}
            onCloneProject={(url: string) => void cloneProject(url)}
            onDeleteAgent={handleDeleteAgent}
            onNewAgent={handleNewAgentForProject}
            onOpenSettings={() => setShowSettings(true)}
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
          fileTreeSplitFraction={paneResize.fileTreeSplitFraction}
          rightPaneRef={paneResize.rightPaneRef}
          worktreeRoot={tree?.path ?? null}
          sessionId={activeSessionId}
          worktreeShellSessionId={worktreeSessionId}
          projectShellSessionId={projectSessionId}
          worktreeCwd={worktreeShellCwd}
          scrollbackLines={settings.scrollbackLines}
          codeViewMode={codeView.codeViewMode}
          diff={diff}
          openFiles={codeView.openFiles}
          activeFilePath={codeView.activeFilePath}
          fileContent={codeView.activeFileContent}
          theme={themeId}
          xtermTheme={xtermTheme}
          tree={tree}
          changes={mergedChanges}
          onNewAgent={() => setShowNewAgent(true)}
          onSelectFile={handleSelectFile}
          onCloseFile={codeView.handleCloseFile}
          onShowDiff={codeView.handleShowDiff}
          onSaveFile={codeView.handleSaveFile}
          expandedPaths={viewState.expandedPaths}
          onToggleExpand={viewState.onToggleExpand}
        />

        <StatusBar
          activeSession={activeSession}
          changedFiles={mergedChanges}
          baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
          paneVisibility={paneResize.paneVisibility}
          onTogglePane={paneResize.togglePane}
          conflicts={gitOps.conflicts}
          aheadBehind={gitOps.aheadBehind}
          onCommit={() => setActivePanel('commit')}
          onCreatePR={() => setActivePanel('pr')}
          onShowConflicts={() => setActivePanel('conflicts')}
        />
      </div>

      {activePanel === 'commit' && activeSessionId && (
        <CommitPanel
          changedFiles={mergedChanges}
          diff={diff}
          onCommit={handleCommit}
          onAiGenerate={gitOps.aiGenerate}
          onClose={handleClosePanel}
        />
      )}

      {activePanel === 'pr' && activeSessionId && activeSession && (
        <PRPanel
          sessionId={activeSessionId}
          branchName={activeSession.branchName}
          baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
          onAiGenerate={gitOps.aiGenerate}
          onClose={handleClosePanel}
        />
      )}

      {activePanel === 'conflicts' && activeSessionId && (
        <ConflictPanel
          sessionId={activeSessionId}
          conflicts={gitOps.conflicts}
          onAiGenerate={gitOps.aiGenerate}
          onResolveConflict={gitOps.resolveConflict}
          onSelectFile={handleSelectFile}
          onClose={handleClosePanel}
        />
      )}

      {activeProjectId && (
        <NewTaskModal
          visible={showNewAgent}
          projectId={activeProjectId}
          projectName={activeProject?.name ?? ''}
          defaultRuntime={settings.defaultRuntime}
          onLaunch={handleLaunchAgent}
          onClose={() => setShowNewAgent(false)}
        />
      )}

      <SettingsModal
        visible={showSettings}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setShowSettings(false)}
        onPreviewTheme={setPreviewThemeId}
      />
    </div>
  )
}
