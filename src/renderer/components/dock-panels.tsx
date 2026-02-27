import React, { createContext, useCallback, useContext, useMemo } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { AgentStatus, FileTreeNode, FileChange, Project, AgentSession, SpawnAgentOptions } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import { TerminalPane } from './TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { ModifiedFiles } from './ModifiedFiles'
import { ShellTabs } from './ShellTabs'
import { OnboardingView } from './OnboardingView'
import { ProjectSidebar } from './ProjectSidebar'
import { WebPreview } from './WebPreview'

export interface DockAppState {
  sessionId: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  // Editor
  fileDiffText: string | null
  originalContent: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onSaveFile: (content: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  // FileTree
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  additionalBranches?: Map<string, string | null>
  primaryBranch: string | null
  changes: FileChange[]
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  // ModifiedFiles
  worktreeRoot: string | null
  // Shell
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  worktreeCwd: string | null
  // Agent creation
  baseBranch: string
  defaultRuntime: string
  onLaunchAgent: (options: SpawnAgentOptions) => void
  // Projects panel
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onDeleteAgent: (id: string) => void
  onNewAgentFromHeader: () => void
  newAgentFocusTrigger: number
  onNewProject: () => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
  // Agent restart
  activeSessionStatus: AgentStatus | null
  activeSessionRuntimeId: string | null
  onResumeAgent: (sessionId: string, runtimeId: string) => Promise<void>
  // Web preview
  previewUrl: string | null
}

export const DockStateContext = createContext<DockAppState | null>(null)

function useDockState(): DockAppState {
  const state = useContext(DockStateContext)
  if (!state) throw new Error('DockStateContext not provided')
  return state
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  agent: AgentPanel,
  editor: EditorPanel,
  fileTree: FileTreePanel,
  modifiedFiles: ModifiedFilesPanel,
  shell: ShellPanel,
  projects: ProjectsPanel,
  webPreview: WebPreviewPanel,
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

function EditorPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <CodeViewer
      sessionId={s.sessionId}
      fileDiffText={s.fileDiffText}
      originalContent={s.originalContent}
      openFiles={s.openFiles}
      activeFilePath={s.activeFilePath}
      fileContent={s.fileContent}
      theme={s.theme}
      onSelectTab={s.onSelectFile}
      onCloseTab={s.onCloseFile}
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
      onSelectFile={s.onSelectFile}
      onDeleteFile={s.onDeleteFile}
      onRenameFile={s.onRenameFile}
    />
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
    />
  )
}

function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
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
