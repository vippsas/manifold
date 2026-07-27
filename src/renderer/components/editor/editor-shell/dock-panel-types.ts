import { createContext, useContext } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { AgentStatus, FileTreeNode, FileChange, Project, AgentSession, AgentSettingsUpdate, SpawnAgentOptions, FavoriteKind, ResolvedFavorite, EditorSettings } from '../../../../shared/types'
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
  // Shell
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  worktreeCwd: string | null
  // Agent creation
  baseBranch: string
  activeProjectIsGit: boolean
  defaultRuntime: string
  defaultAgentMode: 'interactive' | 'chat'
  defaultUseWorktrees: boolean
  activeSessionWorktreePath: string | null
  activeSessionNoWorktree: boolean
  onLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
  // Projects panel
  projects: Project[]
  activeProjectId: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onRenameAgent: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgentFromHeader: (projectId?: string, workspaceId?: string) => void
  onNewProject: () => void
  onCreateWorkspaceFromProject?: (projectId: string) => Promise<void>
  onNewWorkspace?: () => void
  workspaces?: import('../../../../shared/workspace-types').Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace?: (id: string) => void
  onRemoveWorkspace?: (id: string) => Promise<void>
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
  onLaunchWorkspaceAgent?: (workspaceId: string, homeProjectId: string, options: { runtimeId: string; prompt: string; nonInteractive?: boolean }) => Promise<unknown>
  onAddProjectToWorkspace?: (workspaceId: string) => void | Promise<void>
  onRemoveProjectFromWorkspace?: (workspaceId: string, projectId: string) => void
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
  // Favorites
  favorites: ResolvedFavorite[]
  isFavorite: (kind: FavoriteKind, id: string) => boolean
  onToggleFavorite: (kind: FavoriteKind, id: string) => void
  onReorderFavorites: (fromIndex: number, toIndex: number) => void
  onActivateFavorite: (favorite: ResolvedFavorite) => void
}

export const DockStateContext = createContext<DockAppState | null>(null)

export function useDockState(): DockAppState {
  const state = useContext(DockStateContext)
  if (!state) throw new Error('DockStateContext not provided')
  return state
}
