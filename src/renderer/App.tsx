import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { SpawnAgentOptions, FileChange } from '../shared/types'
import { loadTheme, migrateLegacyTheme } from '../shared/themes/registry'
import { applyThemeCssVars } from '../shared/themes/adapter'
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
import { loader } from '@monaco-editor/react'

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
  const { worktreeSessionId, projectSessionId } = useShellSessions(worktreeShellCwd, projectShellCwd, activeSessionId)

  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // ── Theme management ───────────────────────────────────────────────
  // Migrate legacy theme values and compute the theme ID
  const themeId = useMemo(() => migrateLegacyTheme(settings.theme), [settings.theme])

  // Load the converted theme (CSS vars, Monaco, xterm)
  const currentTheme = useMemo(() => loadTheme(themeId), [themeId])

  // Derive theme type class for CSS fallback selectors
  const themeClass = currentTheme.type === 'light' ? 'theme-light' : 'theme-dark'

  // Apply theme: CSS vars, Monaco editor theme, native window
  useEffect(() => {
    applyThemeCssVars(currentTheme.cssVars)

    // Register and activate Monaco theme
    void loader.init().then((monaco) => {
      monaco.editor.defineTheme(themeId, currentTheme.monacoTheme as Parameters<typeof monaco.editor.defineTheme>[1])
      monaco.editor.setTheme(themeId)
    })

    // Notify main process for native window chrome
    window.electronAPI.send('theme:changed', {
      type: currentTheme.type,
      background: currentTheme.cssVars['--bg-primary'],
    })
  }, [themeId, currentTheme])

  // Theme preview state (set by ThemePicker during live preview)
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)

  // Pass xterm theme to terminal components (preview overrides current)
  const xtermTheme: ITheme = previewThemeId
    ? loadTheme(previewThemeId).xtermTheme
    : currentTheme.xtermTheme

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
      <div className={`layout-root ${themeClass}`}>
        <WelcomeDialog
          defaultPath={settings.storagePath}
          onConfirm={handleSetupComplete}
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
        onPreviewTheme={setPreviewThemeId}
      />
    </div>
  )
}
