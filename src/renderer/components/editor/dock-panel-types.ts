import { createContext, useContext } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { AgentStatus, FileTreeNode, FileChange, Project, AgentSession, SpawnAgentOptions } from '../../../shared/types'
import type { EditorPaneView, OpenFile } from '../../hooks/useCodeView'
import type { FileOpenRequest } from './file-open-request'

export interface DockAppState {
  sessionId: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  // Editor
  diffText: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  activeEditorPaneId: string | null
  editorPaneIds: string[]
  getEditorPane: (paneId: string) => EditorPaneView
  lastFileOpenRequest: FileOpenRequest
  theme: string
  onSelectFile: (path: string) => void
  onSelectFileFromFileTree: (path: string) => void
  onSelectOpenFile: (path: string, paneId: string) => void
  onCloseFile: (path: string, paneId?: string | null) => void
  onSaveFile: (path: string, content: string) => void
  onRegisterEditorPane: (paneId: string) => void
  onActivateEditorPane: (paneId: string) => void
  onSplitEditorPane: (paneId: string, direction: 'right' | 'below') => void
  onMoveFileToPane: (filePath: string, targetPaneId: string, sourcePaneId?: string | null) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  worktreeRootPath?: string
  // FileTree
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  additionalBranches?: Map<string, string | null>
  primaryBranch: string | null
  changes: FileChange[]
  fileSearchRequestKey: number
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
  onLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
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
  // Layout
  onClosePanel: (id: string) => void
}

export const DockStateContext = createContext<DockAppState | null>(null)

export function useDockState(): DockAppState {
  const state = useContext(DockStateContext)
  if (!state) throw new Error('DockStateContext not provided')
  return state
}
