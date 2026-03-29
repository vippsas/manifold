import React, { useCallback, useMemo } from 'react'
import { useFileDiff } from '../../hooks/useFileDiff'
import { TerminalPane } from '../terminal/TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { ModifiedFiles } from '../git/ModifiedFiles'
import { ShellTabs } from '../terminal/ShellTabs'
import { OnboardingView } from '../modals/OnboardingView'
import { ProjectSidebar } from '../sidebar/ProjectSidebar'
import { WebPreview } from '../terminal/WebPreview'
import { SearchPanel } from '../search/SearchPanel'
import { pickRandomNorwegianCityName } from '../../../shared/norwegian-cities'
import { DockStateContext, useDockState } from './dock-panel-types'
export type { DockAppState } from './dock-panel-types'
export { DockStateContext } from './dock-panel-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  agent: AgentPanel,
  editor: EditorPanel,
  fileTree: FileTreePanel,
  modifiedFiles: ModifiedFilesPanel,
  shell: ShellPanel,
  projects: ProjectsPanel,
  webPreview: WebPreviewPanel,
  search: SearchPanel,
}

function AgentPanel(): React.JSX.Element {
  const s = useDockState()
  const activeProject = s.projects.find((p) => p.id === s.activeProjectId)
  if (!s.sessionId && s.activeProjectId && activeProject) {
    return (
      <OnboardingView
        variant="no-agent"
        projectId={s.activeProjectId}
        projectName={activeProject.name}
        baseBranch={s.baseBranch}
        defaultRuntime={s.defaultRuntime}
        onLaunch={s.onLaunchAgent}
        focusTrigger={s.newAgentFocusTrigger}
      />
    )
  }

  if (!s.sessionId) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>Select a repository to get started</div>
  }

  const isExited = s.activeSessionStatus === 'done' || s.activeSessionStatus === 'error'

  const handleRestart = useCallback(() => {
    if (s.sessionId && s.activeSessionRuntimeId) {
      void s.onResumeAgent(s.sessionId, s.activeSessionRuntimeId)
    }
  }, [s.sessionId, s.activeSessionRuntimeId, s.onResumeAgent])

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <TerminalPane
        sessionId={s.sessionId}
        scrollbackLines={s.scrollbackLines}
        terminalFontFamily={s.terminalFontFamily}
        label="Agent"
        xtermTheme={s.xtermTheme}
      />
      {isExited && (
        <div style={restartOverlayStyles.container}>
          <button onClick={handleRestart} style={restartOverlayStyles.button}>
            Restart Agent
          </button>
        </div>
      )}
    </div>
  )
}

const restartOverlayStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    justifyContent: 'center',
    padding: '12px',
    background: 'linear-gradient(transparent, var(--bg-primary) 40%)',
    pointerEvents: 'none',
  },
  button: {
    pointerEvents: 'auto',
    padding: '6px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--bg-primary)',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}

function EditorPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const s = useDockState()
  const paneId = api.id
  const pane = s.getEditorPane(paneId)
  const moveTargets = useMemo(
    () => s.editorPaneIds
      .filter((id) => id !== paneId)
      .map((id) => ({
        id,
        label: `Editor ${s.editorPaneIds.indexOf(id) + 1}`,
      })),
    [s.editorPaneIds, paneId],
  )

  React.useEffect(() => {
    s.onRegisterEditorPane(paneId)
  }, [paneId, s])

  const { activeFileDiffText, originalContent } = useFileDiff(
    s.sessionId,
    s.diffText,
    pane.activeFilePath,
    s.worktreeRoot,
  )

  return (
    <CodeViewer
      paneId={paneId}
      sessionId={s.sessionId}
      fileDiffText={activeFileDiffText}
      originalContent={originalContent}
      openFiles={pane.openFiles}
      activeFilePath={pane.activeFilePath}
      fileContent={pane.fileContent}
      lastFileOpenRequest={s.lastFileOpenRequest}
      theme={s.theme}
      moveTargets={moveTargets}
      onActivatePane={() => s.onActivateEditorPane(paneId)}
      onSplitPane={(direction) => s.onSplitEditorPane(paneId, direction)}
      onMoveFile={(filePath, targetPaneId) => s.onMoveFileToPane(filePath, targetPaneId, paneId)}
      onSelectTab={(filePath) => s.onSelectOpenFile(filePath, paneId)}
      onOpenLinkedFile={(filePath) => s.onSelectFileFromMarkdownPreview(filePath, paneId)}
      onCloseTab={(filePath) => s.onCloseFile(filePath, paneId)}
      onSaveFile={s.onSaveFile}
    />
  )
}

function FileTreePanel(): React.JSX.Element {
  const s = useDockState()
  const openFilePaths = useMemo(
    () => new Set(s.openFiles.map((f) => f.path)),
    [s.openFiles]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <FileTree
        tree={s.tree}
        additionalTrees={s.additionalTrees}
        additionalBranches={s.additionalBranches}
        primaryBranch={s.primaryBranch}
        changes={s.changes}
        activeFilePath={s.activeFilePath}
        openFilePaths={openFilePaths}
        expandedPaths={s.expandedPaths}
        onToggleExpand={s.onToggleExpand}
        onSelectFile={s.onSelectFileFromFileTree}
        onDeleteFile={s.onDeleteFile}
        onRenameFile={s.onRenameFile}
        onCreateFile={s.onCreateFile}
        onCreateDir={s.onCreateDir}
        onImportPaths={s.onImportPaths}
        onRevealInFinder={s.onRevealInFinder}
        onOpenInTerminal={s.onOpenInTerminal}
        onCopyAbsolutePath={s.onCopyAbsolutePath}
        onCopyRelativePath={s.onCopyRelativePath}
        worktreeRootPath={s.worktreeRootPath}
      />
    </div>
  )
}

function ModifiedFilesPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ModifiedFiles
      changes={s.changes}
      activeFilePath={s.activeFilePath}
      worktreeRoot={s.worktreeRoot ?? ''}
      onSelectFile={s.onSelectFile}
    />
  )
}

function ShellPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ShellTabs
      worktreeSessionId={s.worktreeShellSessionId}
      projectSessionId={s.projectShellSessionId}
      worktreeCwd={s.worktreeCwd}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
      branchName={s.shellBranchName}
      projectName={s.shellProjectName}
    />
  )
}

function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
  const handleQuickStart = useCallback(() => {
    if (!s.activeProjectId) return
    s.onLaunchAgent({
      projectId: s.activeProjectId,
      runtimeId: s.defaultRuntime,
      prompt: pickRandomNorwegianCityName(),
      noWorktree: true,
      stayOnBranch: true,
    })
  }, [s.activeProjectId, s.defaultRuntime, s.onLaunchAgent])
  return (
    <ProjectSidebar
      projects={s.projects}
      activeProjectId={s.activeProjectId}
      allProjectSessions={s.allProjectSessions}
      activeSessionId={s.sessionId}
      onSelectProject={s.onSelectProject}
      onSelectSession={s.onSelectSession}
      onRemoveProject={s.onRemoveProject}
      onUpdateProject={s.onUpdateProject}
      onDeleteAgent={s.onDeleteAgent}
      onNewAgent={s.onNewAgentFromHeader}
      onQuickStart={s.activeProjectId ? handleQuickStart : undefined}
      onNewProject={s.onNewProject}
      fetchingProjectId={s.fetchingProjectId}
      lastFetchedProjectId={s.lastFetchedProjectId}
      fetchResult={s.fetchResult}
      fetchError={s.fetchError}
      onFetchProject={s.onFetchProject}
    />
  )
}

function WebPreviewPanel(): React.JSX.Element {
  const s = useDockState()
  if (!s.previewUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '12px' }}>
        No preview available
      </div>
    )
  }
  return <WebPreview url={s.previewUrl} />
}
