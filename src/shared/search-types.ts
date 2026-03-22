import type { AgentStatus } from './types'

export type SearchMode = 'code' | 'memory' | 'everything'

export type SearchScopeKind =
  | 'active-session'
  | 'visible-roots'
  | 'all-project-sessions'
  | 'memory-only'

export type SearchMatchMode = 'literal' | 'regex'

export interface SearchScopeDescriptor {
  kind: SearchScopeKind
  sessionIds?: string[]
  rootPaths?: string[]
  includeAdditionalDirs?: boolean
}

export interface SearchQueryRequest {
  projectId: string
  activeSessionId: string | null
  mode: SearchMode
  query: string
  scope: SearchScopeDescriptor
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  includeGlobs?: string[]
  excludeGlobs?: string[]
  limit?: number
  contextLines?: number
  ai?: {
    enabled: boolean
    rerank?: boolean
    answer?: boolean
  }
}

export interface SearchContextSession {
  sessionId: string
  branchName: string
  runtimeId: string
  worktreePath: string
  additionalDirs: string[]
  status: AgentStatus
}

export interface SearchContextResponse {
  projectId: string
  activeSessionId: string | null
  sessions: SearchContextSession[]
}

export interface SearchResultBase {
  id: string
  source: 'code' | 'memory'
  title: string
  snippet: string
  score?: number
  sessionId?: string
  branchName?: string
  runtimeId?: string
}

export interface CodeSearchResult extends SearchResultBase {
  source: 'code'
  filePath: string
  rootPath: string
  relativePath: string
  line: number
  column?: number
  contextBefore?: string[]
  contextAfter?: string[]
}

export interface MemorySearchResultItem extends SearchResultBase {
  source: 'memory'
  memorySource: 'observation' | 'session_summary' | 'interaction'
  createdAt: number
  concepts?: string[]
  filesTouched?: string[]
}

export type UnifiedSearchResult = CodeSearchResult | MemorySearchResultItem

export interface SearchQueryResponse {
  results: UnifiedSearchResult[]
  total: number
  tookMs: number
  warnings?: string[]
}

export interface SearchAskResponse {
  answer: string
  citations: UnifiedSearchResult[]
  tookMs: number
}
