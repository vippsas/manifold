import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
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
import { useAllProjectSessions } from './hooks/useAllProjectSessions'
import { ProjectSidebar } from './components/ProjectSidebar'
import { MainPanes } from './components/MainPanes'
import { NewAgentPopover } from './components/NewAgentPopover'
import { OnboardingView } from './components/OnboardingView'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { WelcomeDialog } from './components/WelcomeDialog'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, cloneProject, removeProject, setActiveProject } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, deleteAgent, setActiveSession } =
    useAgentSession(activeProjectId)
  const { sessionsByProject, removeSession } = useAllProjectSessions(projects, activeProjectId, sessions)
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

  const prevSessionRef = useRef<string | null>(null)
  // Keep refs so the save effect captures current values without re-running on every change
  const codeViewRef = useRef(codeView)
  codeViewRef.current = codeView

  // Save state before switching away from a session
  useEffect(() => {
    const prev = prevSessionRef.current
    if (prev && prev !== activeSessionId) {
      const cv = codeViewRef.current
      viewState.saveCurrentState(prev, cv.openFiles, cv.activeFilePath, cv.codeViewMode)
    }
    prevSessionRef.current = activeSessionId
  }, [activeSessionId, viewState.saveCurrentState])

  // Restore state when viewState provides it
  useEffect(() => {
    if (viewState.restoreCodeView) {
      codeView.restoreState(
        viewState.restoreCodeView.openFiles,
        viewState.restoreCodeView.activeFilePath,
        viewState.restoreCodeView.codeViewMode
      )
    }
  }, [viewState.restoreCodeView, codeView.restoreState])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const worktreeShellCwd = activeSession?.worktreePath ?? null
  const projectShellCwd = activeProject?.path ?? null
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, projectShellCwd)

  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const sidebarDragging = useRef(false)

  const handleSidebarDividerMouseDown = useCallback((_e: React.MouseEvent) => {
    sidebarDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!sidebarDragging.current) return
      const clamped = Math.max(140, Math.min(400, e.clientX))
      setSidebarWidth(clamped)
    }
    const onUp = (): void => {
      if (sidebarDragging.current) {
        sidebarDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleLaunchAgent = useCallback(
    (options: SpawnAgentOptions): void => {
      void spawnAgent(options)
      setShowNewAgent(false)
    },
    [spawnAgent]
  )

  const handleDeleteAgent = useCallback(
    (sessionId: string): void => {
      void deleteAgent(sessionId)
      removeSession(sessionId)
      void window.electronAPI.invoke('view-state:delete', sessionId)
    },
    [deleteAgent, removeSession]
  )

  const handleSelectSession = useCallback(
    (sessionId: string, projectId: string): void => {
      if (projectId !== activeProjectId) {
        setActiveSession(sessionId)
        setActiveProject(projectId)
      } else {
        setActiveSession(sessionId)
      }
    },
    [activeProjectId, setActiveSession, setActiveProject]
  )

  const handleNewAgentForProject = useCallback(
    (projectId: string): void => {
      if (projectId !== activeProjectId) {
        setActiveProject(projectId)
      }
      setShowNewAgent(true)
    },
    [activeProjectId, setActiveProject]
  )

  const handleSaveSettings = useCallback(
    (partial: Partial<typeof settings>): void => {
      void updateSettings(partial)
    },
    [updateSettings]
  )

  const handleSetupComplete = useCallback(
    (storagePath: string): void => {
      void updateSettings({ storagePath, setupCompleted: true })
    },
    [updateSettings]
  )

  if (!settings.setupCompleted) {
    return (
      <div className={`layout-root theme-${settings.theme}`}>
        <WelcomeDialog
          defaultPath={settings.storagePath}
          onConfirm={handleSetupComplete}
        />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className={`layout-root theme-${settings.theme}`}>
        <OnboardingView
          variant="no-project"
          onAddProject={() => void addProject()}
          onCloneProject={(url) => void cloneProject(url)}
        />
      </div>
    )
  }

  return (
    <div className={`layout-root theme-${settings.theme}`}>
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
      />

      <div
        className="sidebar-divider"
        onMouseDown={handleSidebarDividerMouseDown}
      />

      <div className="layout-main">
        <MainPanes
          panesRef={paneResize.panesRef}
          rightAreaRef={paneResize.rightAreaRef}
          leftPaneFraction={paneResize.leftPaneFraction}
          centerFraction={paneResize.centerFraction}
          rightPaneFraction={paneResize.rightPaneFraction}
          bottomPaneFraction={paneResize.bottomPaneFraction}
          handleDividerMouseDown={paneResize.handleDividerMouseDown}
          sessionId={activeSessionId}
          worktreeShellSessionId={worktreeSessionId}
          projectShellSessionId={projectSessionId}
          scrollbackLines={settings.scrollbackLines}
          codeViewMode={codeView.codeViewMode}
          diff={diff}
          openFiles={codeView.openFiles}
          activeFilePath={codeView.activeFilePath}
          fileContent={codeView.activeFileContent}
          theme={settings.theme}
          tree={tree}
          changes={mergedChanges}
          onNewAgent={() => setShowNewAgent(true)}
          onSelectFile={codeView.handleSelectFile}
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
        />
      </div>

      {activeProjectId && (
        <NewAgentPopover
          visible={showNewAgent}
          projectId={activeProjectId}
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
      />
    </div>
  )
}
