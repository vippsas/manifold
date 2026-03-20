// Shared types for the memory system (IPC request/response shapes)

export type ObservationType = 'task_summary' | 'decision' | 'error_resolution' | 'architecture' | 'pattern'

export interface MemoryObservation {
  id: string
  projectId: string
  sessionId: string
  type: ObservationType
  title: string
  summary: string
  facts: string[]
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

export interface MemoryInteraction {
  id: number
  projectId: string
  sessionId: string
  role: string
  text: string
  timestamp: number
}

export interface MemorySessionRow {
  sessionId: string
  projectId: string
  runtimeId: string
  branchName: string
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
  runtimeId?: string
  limit?: number
}

export interface MemorySearchResult {
  id: string
  type: ObservationType
  title: string
  summary: string
  runtimeId?: string
  sessionId: string
  createdAt: number
  rank?: number
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
}

export interface MemoryTimelineResponse {
  items: MemoryObservation[]
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
