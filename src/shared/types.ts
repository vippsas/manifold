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
  taskDescription?: string
  additionalDirs: string[]
  noWorktree?: boolean
}

export interface Project {
  id: string
  name: string
  path: string
  baseBranch: string
  addedAt: string
  autoGenerateMessages?: boolean
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
  defaultRuntime: string
  theme: string
  scrollbackLines: number
  terminalFontFamily: string
  defaultBaseBranch: string
  notificationSound: boolean
  shellPrompt: boolean
  uiMode: 'developer' | 'simple'
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  provisioning?: import('./provisioning-types').ProvisioningSettings
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
  branchName?: string
  existingBranch?: string
  prIdentifier?: string
  noWorktree?: boolean
  stayOnBranch?: boolean
  nonInteractive?: boolean
  cols?: number
  rows?: number
  ollamaModel?: string
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
