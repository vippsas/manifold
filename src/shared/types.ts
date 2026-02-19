export interface AgentRuntime {
  id: string
  name: string
  binary: string
  args?: string[]
  waitingPattern?: string
  env?: Record<string, string>
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
}

export interface Project {
  id: string
  name: string
  path: string
  baseBranch: string
  addedAt: string
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
  defaultRuntime: string
  theme: 'dark' | 'light'
  scrollbackLines: number
  defaultBaseBranch: string
}

export const DEFAULT_SETTINGS: ManifoldSettings = {
  defaultRuntime: 'claude',
  theme: 'dark',
  scrollbackLines: 5000,
  defaultBaseBranch: 'main'
}

export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  branchName?: string
  cols?: number
  rows?: number
}

export interface CreatePROptions {
  sessionId: string
  title?: string
  body?: string
}
