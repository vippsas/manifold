import React, { createContext, useContext, useMemo } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { FileTreeNode, FileChange, Project, AgentSession } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import { TerminalPane } from './TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { ModifiedFiles } from './ModifiedFiles'
import { ShellTabs } from './ShellTabs'
import { OnboardingView } from './OnboardingView'
import { ProjectSidebar } from './ProjectSidebar'

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
  changes: FileChange[]
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  // ModifiedFiles
  worktreeRoot: string | null
  // Shell
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  worktreeCwd: string | null
  // Onboarding
  onNewAgentWithDescription: (description: string) => void
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
  onNewProject: () => void
  onOpenSettings: () => void
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
}

function AgentPanel(): React.JSX.Element {
  const s = useDockState()
  if (!s.sessionId) {
    return <OnboardingView variant="no-agent" onNewAgent={s.onNewAgentWithDescription} />
  }
  return (
    <TerminalPane
      sessionId={s.sessionId}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      label="Agent"
      xtermTheme={s.xtermTheme}
    />
  )
}

function EditorPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <CodeViewer
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
      onOpenSettings={s.onOpenSettings}
    />
  )
}
