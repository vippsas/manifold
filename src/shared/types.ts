export interface AgentRuntime {
  id: string
  name: string
  binary: string
  args?: string[]
  aiModelArgs?: string[]
  waitingPattern?: string
  env?: Record<string, string>
  installed?: boolean
  needsModel?: boolean
}

export type AgentStatus = 'running' | 'waiting' | 'done' | 'error'

export interface AgentSession {
  id: string
  projectId: string
  runtimeId: string
  branchName: string
  worktreePath: string
  status: AgentStatus
  pid: number | null
  displayName?: string
  taskDescription?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  additionalDirs: string[]
  noWorktree?: boolean
  /** If set, this agent belongs to a workspace; its working set spans the workspace's repos. */
  workspaceId?: string
  /** projectId -> worktree path for every repo in this agent's working set (incl. primary). Used to tear down the full set. */
  workspaceWorktreePaths?: Record<string, string>
  /**
   * If set, this agent belongs to a group of siblings spawned together (e.g.
   * by a Watch playlist run). Grouped siblings are hidden from the default
   * dock tab bar; the group's owner UI (e.g. the Watch panel) handles
   * navigation to them.
   */
  groupId?: string
  /** True when this session runs Claude in non-interactive (chat) mode. */
  nonInteractive?: boolean
  /** When true, the agent is protected from deletion until explicitly unlocked. */
  locked?: boolean
}

export type ProjectKind = 'git' | 'folder'

export interface Project {
  id: string
  name: string
  path: string
  baseBranch: string
  addedAt: string
  kind?: ProjectKind
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  /** Cached slash-command/skill names from Claude's last `system/init`, so the chat `/` autocomplete is populated before the first message. */
  slashCommands?: string[]
}

export type FavoriteKind = 'repo' | 'workspace'

/** A persisted favorite: a typed pointer to a Project or Workspace by id. */
export interface FavoriteRef {
  kind: FavoriteKind
  id: string
}

/** A favorite resolved against the live project/workspace lists, for display. */
export interface ResolvedFavorite {
  kind: FavoriteKind
  id: string
  name: string
}

export interface CreateProjectOptions {
  description: string
  repoName?: string
  targetDir?: string
  projectKind?: ProjectKind
}

export type FileChangeType = 'added' | 'modified' | 'deleted'

export interface FileChange {
  path: string
  type: FileChangeType
  /**
   * True when the file differs only because the base branch advanced (e.g.
   * another worktree's work landed on it), not because this worktree changed
   * it. Absent for the worktree's own changes. See DiffProvider.getChangedFiles.
   */
  foreignWorktree?: boolean
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  wordWrap: 'on' | 'off'
  /** Force-wrap Markdown files; when false they follow `wordWrap` like any other file. */
  markdownWordWrap: boolean
  minimap: boolean
  tabSize: number
}

/** Which context segments the built-in Manifold shell prompt renders. */
export interface ShellPromptSegments {
  repo: boolean
  agent: boolean
  k8sContext: boolean
  k8sNamespace: boolean
}

export type NotificationScope = 'non-active' | 'unfocused' | 'always'

/** Desktop (OS) notifications for agent lifecycle transitions. macOS Focus / DND
 *  is respected natively, so there is no in-app quiet-hours schedule. */
export interface NotificationSettings {
  /** Master switch for all desktop notifications. */
  enabled: boolean
  /** Notify when a session transitions to `done`. */
  onDone: boolean
  /** Notify when a session transitions to `waiting` (needs input). */
  onWaiting: boolean
  /** Notify when a session transitions to `error`. */
  onError: boolean
  /** Which sessions raise a notification. */
  scope: NotificationScope
}

export interface ManifoldSettings {
  storagePath: string
  setupCompleted: boolean
  lastSeenReleaseNotesVersion: string
  defaultRuntime: string
  defaultAgentMode?: 'interactive' | 'chat'
  theme: string
  scrollbackLines: number
  terminalFontFamily: string
  defaultBaseBranch: string
  notificationSound: boolean
  notifications?: NotificationSettings
  shellPrompt: boolean
  shellPromptSegments?: ShellPromptSegments
  shellHistoryScope: 'project' | 'global'
  uiMode: 'developer' | 'simple'
  autoGenerateMessages: boolean
  showCommitAndPrButtons: boolean
  sidebarResizeReversed: boolean
  /** Ordered, typed favorites. Index 0 maps to ⌘1. */
  favorites?: FavoriteRef[]
  keepAwake: boolean
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  editor?: EditorSettings
  transcription?: import('./plugins/api-types').AiServiceSettings
  pluginConfig?: Record<string, Record<string, unknown>>
  /** Plugin IDs that have been explicitly disabled by the user. */
  disabledPlugins?: string[]
  /** Internal: whether the default-disabled plugin set has been seeded into
   *  `disabledPlugins` once. Prevents re-disabling a plugin the user later enables. */
  pluginDefaultsSeeded?: boolean
}

export interface ReleaseNotes {
  version: string
  name: string
  body: string
  url: string
  publishedAt: string | null
  source: 'github' | 'fallback'
}

export interface SearchAiSettings {
  enabled: boolean
  mode: 'answer' | 'rerank'
  runtimeId: 'default' | string
  citationLimit: number
  maxContextResults: number
}

export interface SearchSettings {
  ai: SearchAiSettings
}

export interface SessionEditorPaneState {
  id: string
  openFilePaths: string[]
  activeFilePath: string | null
}

export interface SessionViewState {
  openFilePaths: string[]
  activeFilePath: string | null
  expandedPaths: string[]
  editorPanes?: SessionEditorPaneState[]
  activeEditorPaneId?: string | null
}

export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  userMessage?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  branchName?: string
  existingBranch?: string
  prIdentifier?: string
  noWorktree?: boolean
  stayOnBranch?: boolean
  nonInteractive?: boolean
  cols?: number
  rows?: number
  ollamaModel?: string
  /**
   * Attach the session to an existing worktree instead of creating a new one.
   * Used when a workspace's worktree already exists and we want to
   * spawn an interactive session inside it.
   */
  existingWorktreePath?: string
  /** If set, the spawned session belongs to this workspace. */
  workspaceId?: string
  /** Extra repo roots (the workspace's other repos) injected into the runtime at launch and recorded on the session. */
  additionalDirs?: string[]
  /** projectId -> worktree path for the full working set, persisted for teardown. */
  workspaceWorktreePaths?: Record<string, string>
  /**
   * Tags the session as part of a sibling group (e.g. a Watch playlist run).
   * Grouped siblings are hidden from the default dock tab bar; the group's
   * owner UI handles navigation to them.
   */
  groupId?: string
}

export interface CreatePROptions {
  sessionId: string
  title?: string
  body?: string
}

export interface BranchInfo {
  name: string
  source: 'local' | 'remote' | 'both'
}

export interface PRInfo {
  number: number
  title: string
  headRefName: string
  author: string
}

export interface AheadBehind {
  ahead: number
  behind: number
}

export interface PRContext {
  commits: string
  diffStat: string
  diffPatch: string
}

export interface FetchResult {
  updatedBranch: string
  previousRef: string
  currentRef: string
  commitCount: number
}
