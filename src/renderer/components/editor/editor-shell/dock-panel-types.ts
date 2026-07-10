import { createContext, useContext } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { AgentStatus, FileTreeNode, FileChange, Project, AgentSession, SpawnAgentOptions, EditorSettings } from '../../../../shared/types'
import type { SearchMode } from '../../../../shared/search-types'
import type { EditorPaneView, OpenFile } from '../../../hooks/editor/useCodeView'
import type { FileOpenRequest } from '../file-open-request'
import type { DraftChat } from '../../../../shared/draft-chat'
import type { DockPanelId } from '../../../hooks/dock-layout/dock-layout-helpers'

export interface DockAppState {
  sessionId: string | null
  /** The "primary" session for the active worktree (the one represented in the
   *  sidebar). May equal sessionId, or differ when a sibling dock tab is active. */
  primarySessionId: string | null
  searchFocusRequestKey: number
  requestedSearchMode: SearchMode | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  editorSettings?: EditorSettings
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
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
  onOpenSearchResultInSplit: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
  onSelectFileFromFileTree: (path: string) => void
  onSelectOpenFile: (path: string, paneId: string) => void
  onSelectFileFromMarkdownPreview: (path: string, paneId: string) => void
  onCloseFile: (path: string, paneId?: string | null) => void
  onCloseOtherFiles: (path: string, paneId?: string | null) => void
  onCloseAllFiles: (paneId?: string | null) => void
  onSaveFile: (path: string, content: string) => void
  onRegisterEditorPane: (paneId: string) => void
  onActivateEditorPane: (paneId: string) => void
  onSplitEditorPane: (paneId: string, direction: 'right' | 'below') => void
  onMoveFileToPane: (filePath: string, targetPaneId: string, sourcePaneId?: string | null) => void
  onMoveFileToSplitPane: (filePath: string, sourcePaneId: string, direction: 'right' | 'below') => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>
  onRefreshFileTree?: () => Promise<void>
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onPasteImage?: (dirPath: string, dataUrl: string) => Promise<string | null>
  onPasteClipboardImage?: (dirPath: string) => Promise<{ pasted: boolean; error: string | null }>
  onMovePath?: (sourcePath: string, targetDir: string, options?: { overwrite?: boolean }) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  worktreeRootPath?: string
  // FileTree
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  additionalBranches?: Map<string, string | null>
  /** Display names per workspace file-tree root path (repo names). */
  rootLabels?: Map<string, string>
  primaryBranch: string | null
  changes: FileChange[]
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  // ModifiedFiles
  worktreeRoot: string | null
  // Source Control (git changes sidebar view): commit the working tree with a
  // message (stages everything, like git:commit) then refresh the diff. Distinct
  // from the modal commit flow — it does not chain into the PR step. onAiGenerate
  // drafts a message from a prompt the view builds out of the current diff.
  onCommit: (message: string) => Promise<void>
  onAiGenerate: (prompt: string) => Promise<string>
  // Shell
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  worktreeCwd: string | null
  // Agent creation
  baseBranch: string
  activeProjectIsGit: boolean
  defaultRuntime: string
  defaultAgentMode: 'interactive' | 'chat'
  activeSessionWorktreePath: string | null
  activeSessionNoWorktree: boolean
  onLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
  // Chat switcher / agent panel
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  outputtingSessionIds: Set<string>
  onSelectSession: (sessionId: string, projectId: string) => void
  onRenameAgent: (sessionId: string, displayName: string) => void
  onToggleLocked: (sessionId: string, locked: boolean) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgentFromHeader: () => void
  newAgentFocusTrigger: number
  /** Open a native folder picker and add the chosen folder as context: attaches
   *  it to the active chat (agent:add-dir) or, with no live chat, adds it as a repo. */
  onOpenFolder: () => void
  workspaces?: import('../../../../shared/workspace-types').Workspace[]
  activeWorkspaceId?: string | null
  onLaunchWorkspaceAgent?: (workspaceId: string, homeProjectId: string, options: { runtimeId: string; prompt: string; nonInteractive?: boolean }) => Promise<unknown>
  // Agent restart
  activeSessionStatus: AgentStatus | null
  activeSessionRuntimeId: string | null
  onResumeAgent: (sessionId: string, runtimeId: string) => Promise<void>
  // Layout
  onFocusSearch: (mode: SearchMode) => void
  onClosePanel: (id: string) => void
  /** Toggle focus mode for a pane (double-click its tab): maximize it to fill the
   *  dock — hiding all other panes and both sidebars — or restore everything. */
  onToggleMaximize: (id: string) => void
  /** Collapse a sidebar (left = projects, right = file tree) to width 0. */
  onCollapseSidebar: (side: 'left' | 'right') => void
  /** Open a launcher module as a tab, or focus it if already open. */
  onOpenModule: (id: DockPanelId) => void
  /** Whether a launcher module currently has an open tab. */
  isModuleOpen: (id: DockPanelId) => boolean
  /** Open a plugin-contributed view as a dock panel. */
  onOpenPluginView: (viewId: string, title: string) => void
  /** Open a plugin-contributed tree view as a native dock panel. */
  onOpenPluginTreeView: (viewId: string, title: string) => void
  onFocusPanel: (id: string) => void
  onOpenSibling: (sessionId: string, title?: string, referencePanelId?: string) => void
  onCloseSiblingPanel: (sessionId: string) => void
  /** Open the global Dashboard home surface, optionally drilled into a card. */
  onOpenDashboard: (cardId?: string) => void
  drafts: DraftChat[]
  activeDraft: DraftChat | null
  promoteDraft: (draftId: string, firstMessage: string) => Promise<void>
  discardDraft: (draftId: string) => void
}

export const DockStateContext = createContext<DockAppState | null>(null)

export function useDockState(): DockAppState {
  const state = useContext(DockStateContext)
  if (!state) throw new Error('DockStateContext not provided')
  return state
}
