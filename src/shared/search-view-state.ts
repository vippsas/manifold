import type { ObservationType } from './memory-types'
import type { SearchMatchMode, SearchMode, SearchScopeKind } from './search-types'

export interface SearchViewSnapshot {
  mode: SearchMode
  query: string
  scopeKind: SearchScopeKind
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  memoryTypeFilter: ObservationType | null
  memoryConceptFilter: string | null
}

export interface SearchHistoryEntry {
  id: string
  label: string
  snapshot: SearchViewSnapshot
  usedAt: number
  resultCount?: number
}

export interface SavedSearchEntry extends SearchHistoryEntry {
  savedAt: number
}

export interface ProjectSearchViewState {
  recent: SearchHistoryEntry[]
  saved: SavedSearchEntry[]
}

export const EMPTY_PROJECT_SEARCH_VIEW_STATE: ProjectSearchViewState = {
  recent: [],
  saved: [],
}
