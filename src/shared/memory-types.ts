// Shared types for the memory system (IPC request/response shapes)

export type ObservationType =
  | 'task_summary'
  | 'decision'
  | 'error_resolution'
  | 'architecture'
  | 'pattern'
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'discovery'
  | 'change'

export interface MemoryObservation {
  id: string
  projectId: string
  sessionId: string
  type: ObservationType
  title: string
  summary: string
  narrative?: string
  facts: string[]
  concepts?: string[]
  filesTouched: string[]
  createdAt: number
}

export interface SessionSummary {
  id: string
  projectId: string
  sessionId: string
  runtimeId: string
  branchName: string
  taskDescription: string
  whatWasDone: string
  whatWasLearned: string
  decisionsMade: string[]
  filesChanged: string[]
  createdAt: number
}

export interface ToolUseEvent {
  toolName: string
  inputSummary: string
  outputSummary?: string
  timestamp: number
}

export interface MemoryInteraction {
  id: number
  projectId: string
  sessionId: string
  role: string
  text: string
  toolEvents?: ToolUseEvent[]
  timestamp: number
}

export interface MemorySessionRow {
  sessionId: string
  projectId: string
  runtimeId: string
  branchName: string
  worktreePath: string | null
  taskDescription: string | null
  startedAt: number
  endedAt: number | null
}

export interface MemorySettings {
  enabled: boolean
  compressionRuntime: 'auto' | string
  injectionEnabled: boolean
  injectionTokenBudget: number
  injectionMethod: 'auto' | 'context-file'
  rawRetentionDays: number
}

// IPC request/response types

export interface MemorySearchRequest {
  projectId: string
  query: string
  type?: ObservationType
  concepts?: string[]
  runtimeId?: string
  limit?: number
}

export interface MemorySearchResult {
  id: string
  type: ObservationType
  source: 'observation' | 'session_summary' | 'interaction'
  title: string
  summary: string
  runtimeId?: string
  branchName?: string
  worktreePath?: string
  sessionId: string
  createdAt: number
  rank?: number
  concepts?: string[]
  filesTouched?: string[]
}

export interface MemorySearchResponse {
  results: MemorySearchResult[]
  total: number
}

export interface MemoryTimelineRequest {
  projectId: string
  cursor?: number
  limit?: number
  type?: ObservationType
  concepts?: string[]
}

export interface MemoryObservationTimelineItem {
  id: string
  projectId: string
  sessionId: string
  source: 'observation'
  type: ObservationType
  title: string
  summary: string
  narrative?: string
  facts: string[]
  concepts?: string[]
  filesTouched: string[]
  createdAt: number
}

export interface MemorySessionSummaryTimelineItem {
  id: string
  projectId: string
  sessionId: string
  source: 'session_summary'
  type: 'task_summary'
  title: string
  summary: string
  runtimeId: string
  branchName: string
  whatWasLearned: string
  decisionsMade: string[]
  filesChanged: string[]
  createdAt: number
}

export interface MemoryInteractionTimelineItem {
  id: string
  projectId: string
  sessionId: string
  source: 'interaction'
  type: 'task_summary'
  title: string
  summary: string
  role: string
  createdAt: number
}

export type MemoryTimelineItem =
  | MemoryObservationTimelineItem
  | MemorySessionSummaryTimelineItem
  | MemoryInteractionTimelineItem

export interface MemoryTimelineResponse {
  items: MemoryTimelineItem[]
  nextCursor: number | null
}

export interface MemoryStats {
  projectId: string
  totalInteractions: number
  totalObservations: number
  totalSummaries: number
  totalSessions: number
  oldestInteraction: number | null
  newestInteraction: number | null
}
