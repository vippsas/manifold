import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { SpawnAgentOptions } from '../shared/types'
import { useProjects } from './hooks/useProjects'
import { useAgentSession } from './hooks/useAgentSession'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useDiff } from './hooks/useDiff'
import { useSettings } from './hooks/useSettings'
import { usePaneResize } from './hooks/usePaneResize'
import { useCodeView } from './hooks/useCodeView'
import { useViewState } from './hooks/useViewState'
import { useShellSession } from './hooks/useShellSession'
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
  const { diff, changedFiles, refreshDiff } = useDiff(activeSessionId)
  const paneResize = usePaneResize()
  const codeView = useCodeView(activeSessionId)

  const handleFilesChanged = useCallback(() => {
    void codeView.refreshOpenFiles()
    void refreshDiff()
  }, [codeView.refreshOpenFiles, refreshDiff])

  const { tree } = useFileWatcher(activeSessionId, handleFilesChanged)
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
  const shellCwd = activeSession?.worktreePath ?? activeProject?.path ?? null
  const shellSessionId = useShellSession(shellCwd)

  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
      void window.electronAPI.invoke('view-state:delete', sessionId)
    },
    [deleteAgent]
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
        projects={projects}
        activeProjectId={activeProjectId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectProject={setActiveProject}
        onSelectSession={setActiveSession}
        onAddProject={addProject}
        onRemoveProject={removeProject}
        onCloneProject={(url: string) => void cloneProject(url)}
        onDeleteAgent={handleDeleteAgent}
        onNewAgent={() => setShowNewAgent(true)}
        onOpenSettings={() => setShowSettings(true)}
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
          shellSessionId={shellSessionId}
          scrollbackLines={settings.scrollbackLines}
          codeViewMode={codeView.codeViewMode}
          diff={diff}
          openFiles={codeView.openFiles}
          activeFilePath={codeView.activeFilePath}
          fileContent={codeView.activeFileContent}
          theme={settings.theme}
          tree={tree}
          changes={changedFiles}
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
          changedFiles={changedFiles}
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
