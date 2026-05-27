import React, { useCallback, useMemo } from 'react'
import { useFileDiff } from '../../hooks/useFileDiff'
import { TerminalPane } from '../terminal/TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { ModifiedFiles } from '../git/ModifiedFiles'
import { FleetModifiedFiles } from '../git/FleetModifiedFiles'
import { ShellTabs } from '../terminal/ShellTabs'
import { OnboardingView } from '../modals/OnboardingView'
import { ProjectSidebar } from '../sidebar/ProjectSidebar'
import { WebPreview } from '../terminal/WebPreview'
import { SearchPanel } from '../search/SearchPanel'
import { BackgroundAgentPanel } from '../background-agent/BackgroundAgentPanel'
import { LoopPanel } from '../loop/LoopPanel'
import { VerdictsPanel } from '../verdicts/VerdictsPanel'
import { WatchPanel } from '../watch/WatchPanel'
import { SuperagentFleetTree } from '../sidebar/SuperagentFleetTree'
import { SuperagentAgentPanel, restartOverlayStyles } from './SuperagentAgentPanel'
import { AgentChatView } from './AgentChatView'
import { DraftChatView } from './DraftChatView'
import { DockStateContext, useDockState } from './dock-panel-types'
import { parseSiblingSessionId } from '../../hooks/agent-siblings'
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
  backgroundAgent: BackgroundAgentPanel,
  loop: LoopPanel,
  verdicts: VerdictsPanel,
  watch: WatchPanel,
}

interface AgentTerminalViewProps {
  sessionId: string
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: import('@xterm/xterm').ITheme
  isExited: boolean
  onRestart: () => void
}

// Memoized so file clicks (which mutate unrelated dock-state fields like
// lastFileOpenRequest, openFiles, etc.) don't tear through the terminal subtree.
// The outer AgentPanel still re-renders on every context change, but its
// returned element here is shallow-equal across those renders and short-circuits.
const AgentTerminalView = React.memo(function AgentTerminalView({
  sessionId,
  scrollbackLines,
  terminalFontFamily,
  xtermTheme,
  isExited,
  onRestart,
}: AgentTerminalViewProps): React.JSX.Element {
  return (
    <div style={agentTerminalWrapperStyle}>
      <TerminalPane
        sessionId={sessionId}
        scrollbackLines={scrollbackLines}
        terminalFontFamily={terminalFontFamily}
        label="Agent"
        xtermTheme={xtermTheme}
      />
      {isExited && (
        <div style={restartOverlayStyles.container}>
          <button onClick={onRestart} style={restartOverlayStyles.button}>
            Restart Agent
          </button>
        </div>
      )}
    </div>
  )
})

const agentTerminalWrapperStyle: React.CSSProperties = { position: 'relative', height: '100%' }

function AgentPanel({ api }: { api?: { id: string } } = {}): React.JSX.Element {
  const s = useDockState()
  const activeProject = s.projects.find((p) => p.id === s.activeProjectId)

  const panelId = api?.id ?? 'agent'
  const siblingSessionId = parseSiblingSessionId(panelId)
  const targetSessionId = siblingSessionId ?? s.primarySessionId ?? s.sessionId

  const projectSessions = s.activeProjectId
    ? s.allProjectSessions[s.activeProjectId] ?? []
    : []
  const targetSession = targetSessionId
    ? projectSessions.find((session) => session.id === targetSessionId)
      ?? Object.values(s.allProjectSessions).flat().find((session) => session.id === targetSessionId)
      ?? null
    : null
  const targetRuntimeId = targetSession?.runtimeId ?? null
  const targetStatus = targetSession?.status ?? null

  const onResumeAgent = s.onResumeAgent
  const handleRestart = useCallback(() => {
    if (targetSessionId && targetRuntimeId) {
      void onResumeAgent(targetSessionId, targetRuntimeId)
    }
  }, [targetSessionId, targetRuntimeId, onResumeAgent])

  if (s.activeSuperagentId && !siblingSessionId) {
    return <SuperagentAgentPanel />
  }

  if (s.activeDraft) {
    const activeDraft = s.activeDraft
    const draftProject = s.projects.find((p) => p.id === activeDraft.projectId)
    return (
      <DraftChatView
        onFirstSend={(text) => { void s.promoteDraft(activeDraft.id, text) }}
        projectName={draftProject?.name}
        branchName={activeDraft.branchName}
      />
    )
  }

  if (!targetSessionId && s.activeProjectId && activeProject) {
    return (
      <OnboardingView
        variant="no-agent"
        projectId={s.activeProjectId}
        projectName={activeProject.name}
        projectPath={activeProject.path}
        baseBranch={s.baseBranch}
        isGitProject={s.activeProjectIsGit}
        defaultRuntime={s.defaultRuntime}
        onLaunch={s.onLaunchAgent}
        existingSessions={projectSessions}
        onResumeSession={s.onResumeAgent}
        onDeleteSession={(session) => s.onRequestDeleteAgent(session, activeProject.path)}
        focusTrigger={s.newAgentFocusTrigger}
        onNewSuperagent={s.onNewSuperagent}
      />
    )
  }

  if (!targetSessionId) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>Select a repository to get started</div>
  }

  const isExited = targetStatus === 'done' || targetStatus === 'error'

  if (targetSession?.nonInteractive) {
    return <AgentChatView sessionId={targetSessionId} />
  }

  return (
    <AgentTerminalView
      sessionId={targetSessionId}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
      isExited={isExited}
      onRestart={handleRestart}
    />
  )
}

function EditorPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const s = useDockState()
  const paneId = api.id
  const pane = s.getEditorPane(paneId)

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
      onActivatePane={() => s.onActivateEditorPane(paneId)}
      onSelectTab={(filePath) => s.onSelectOpenFile(filePath, paneId)}
      onMoveTabToSplitPane={(filePath, direction) => s.onMoveFileToSplitPane(filePath, paneId, direction)}
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

  if (s.activeSuperagent) {
    return (
      <SuperagentFleetTree
        superagent={s.activeSuperagent}
        projects={s.projects}
        allProjectSessions={s.allProjectSessions}
        onSelectSession={s.onSelectSession}
        onSelectSuperagentHome={s.onSelectSuperagentHome}
        onSelectFile={s.onSelectFileFromFileTree}
      />
    )
  }

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
        onMovePath={s.onMovePath}
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
  if (s.activeSuperagent) {
    return (
      <FleetModifiedFiles
        superagent={s.activeSuperagent}
        projects={s.projects}
        activeFilePath={s.activeFilePath}
        onSelectFile={s.onSelectFileFromFileTree}
      />
    )
  }
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
    />
  )
}

function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ProjectSidebar
      projects={s.projects}
      activeProjectId={s.activeProjectId}
      suppressedProjectIds={s.suppressedProjectIds}
      allProjectSessions={s.allProjectSessions}
      activeSessionId={s.sessionId}
      outputtingSessionIds={s.outputtingSessionIds}
      onSelectProject={s.onSelectProject}
      onSelectSession={s.onSelectSession}
      onRemoveProject={s.onRemoveProject}
      onUpdateProject={s.onUpdateProject}
      onRequestDeleteAgent={s.onRequestDeleteAgent}
      onNewAgent={s.onNewAgentFromHeader}
      onNewProject={s.onNewProject}
      superagents={s.superagents}
      activeSuperagentId={s.activeSuperagentId}
      onSelectSuperagent={s.onSelectSuperagent}
      onRemoveSuperagent={s.onRemoveSuperagent}
      onRequestAddProjectToSuperagent={s.onRequestAddProjectToSuperagent}
      onSpawnFleetAgent={s.onSpawnFleetAgent}
      fetchingProjectId={s.fetchingProjectId}
      lastFetchedProjectId={s.lastFetchedProjectId}
      fetchResult={s.fetchResult}
      fetchError={s.fetchError}
      onFetchProject={s.onFetchProject}
      drafts={s.drafts}
      activeDraftId={s.activeDraft?.id ?? null}
      onSelectDraft={(id) => s.onSelectSession(id, s.activeProjectId ?? '')}
      onDiscardDraft={s.discardDraft}
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
