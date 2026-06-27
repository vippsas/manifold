import type { ObservationType } from '../../../shared/memory-types'
import type {
  SearchAskResponse,
  SearchContextResponse,
  SearchMode,
  SearchScopeKind,
  SearchMatchMode,
  UnifiedSearchResult,
} from '../../../shared/search-types'

export interface UseSearchResult {
  context: SearchContextResponse | null
  mode: SearchMode
  setMode: (mode: SearchMode) => void
  query: string
  setQuery: (query: string) => void
  scopeKind: SearchScopeKind
  setScopeKind: (scope: SearchScopeKind) => void
  matchMode: SearchMatchMode
  setMatchMode: (mode: SearchMatchMode) => void
  caseSensitive: boolean
  setCaseSensitive: (value: boolean) => void
  wholeWord: boolean
  setWholeWord: (value: boolean) => void
  memoryTypeFilter: ObservationType | null
  setMemoryTypeFilter: (value: ObservationType | null) => void
  memoryConceptFilter: string | null
  setMemoryConceptFilter: (value: string | null) => void
  results: UnifiedSearchResult[]
  warnings: string[]
  isSearching: boolean
  canAskAi: boolean
  aiAnswer: SearchAskResponse | null
  isAsking: boolean
  ask: () => Promise<void>
  clearAiAnswer: () => void
  aiError: string | null
  error: string | null
}
