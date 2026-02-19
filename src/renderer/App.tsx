import React, { useState, useCallback } from 'react'
import type { SpawnAgentOptions } from '../shared/types'
import { useProjects } from './hooks/useProjects'
import { useAgentSession } from './hooks/useAgentSession'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useDiff } from './hooks/useDiff'
import { useSettings } from './hooks/useSettings'
import { usePaneResize } from './hooks/usePaneResize'
import { useCodeView } from './hooks/useCodeView'
import { useShellSession } from './hooks/useShellSession'
import { ProjectSidebar } from './components/ProjectSidebar'
import { MainPanes } from './components/MainPanes'
import { NewAgentPopover } from './components/NewAgentPopover'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'

export function App(): React.JSX.Element {
  const { settings, updateSettings } = useSettings()
  const { projects, activeProjectId, addProject, removeProject, setActiveProject } = useProjects()
  const { sessions, activeSessionId, activeSession, spawnAgent, setActiveSession } =
    useAgentSession(activeProjectId)
  const { tree, changes } = useFileWatcher(activeSessionId)
  const { diff, changedFiles } = useDiff(activeSessionId)
  const paneResize = usePaneResize()
  const codeView = useCodeView(activeSessionId)
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

  const handleSaveSettings = useCallback(
    (partial: Partial<typeof settings>): void => {
      void updateSettings(partial)
    },
    [updateSettings]
  )

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
          changes={changes}
          onSelectFile={codeView.handleSelectFile}
          onCloseFile={codeView.handleCloseFile}
          onShowDiff={codeView.handleShowDiff}
          onSaveFile={codeView.handleSaveFile}
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
