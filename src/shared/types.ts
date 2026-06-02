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
  // True if the runtime accepts Claude-style `--mcp-config` / `--strict-mcp-config`
  // flags, which the superagent orchestrator requires.
  orchestratorCapable?: boolean
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
  taskDescription?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  additionalDirs: string[]
  noWorktree?: boolean
  /** If set, this agent was spawned by a superagent and is listed as a child. */
  parentSuperagentId?: string
  /**
   * If set, this agent belongs to a group of siblings spawned together (e.g.
   * by a Watch playlist run). Grouped siblings are hidden from the default
   * dock tab bar; the group's owner UI (e.g. the Watch panel) handles
   * navigation to them.
   */
  groupId?: string
  /** True when this session runs Claude in non-interactive (chat) mode. */
  nonInteractive?: boolean
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
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
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
  shellPrompt: boolean
  shellHistoryScope: 'project' | 'global'
  uiMode: 'developer' | 'simple'
  autoGenerateMessages: boolean
  showCommitAndPrButtons: boolean
  sidebarResizeReversed: boolean
  keepAwake: boolean
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  provisioning?: import('./provisioning-types').ProvisioningSettings
  transcription?: import('./watch-types').AiServiceSettings
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
  /** If set, the spawned session is owned by this superagent. */
  parentSuperagentId?: string
  /**
   * Attach the session to an existing worktree instead of creating a new one.
   * Used when a superagent's fleet worktree already exists and we want to
   * spawn an interactive session inside it.
   */
  existingWorktreePath?: string
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
