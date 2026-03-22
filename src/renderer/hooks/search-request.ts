import type { ObservationType } from '../../shared/memory-types'
import type {
  SearchContextResponse,
  SearchMatchMode,
  SearchMode,
  SearchQueryRequest,
  SearchScopeDescriptor,
  SearchScopeKind,
} from '../../shared/search-types'

export const DEFAULT_SEARCH_LIMIT = 100

interface BuildSearchQueryRequestParams {
  activeProjectId: string | null
  activeSessionId: string | null
  mode: SearchMode
  query: string
  scope: SearchScopeDescriptor
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  memoryTypeFilter: ObservationType | null
  memoryConceptFilter: string | null
}

export function buildSearchQueryRequest(
  params: BuildSearchQueryRequestParams,
): SearchQueryRequest | null {
  const query = params.query.trim()
  if (!params.activeProjectId || !query) return null

  return {
    projectId: params.activeProjectId,
    activeSessionId: params.activeSessionId,
    mode: params.mode,
    query,
    scope: params.scope,
    matchMode: params.matchMode,
    caseSensitive: params.caseSensitive,
    wholeWord: params.wholeWord,
    limit: DEFAULT_SEARCH_LIMIT,
    contextLines: 1,
    memoryFilters: params.mode === 'memory'
      ? {
          type: params.memoryTypeFilter ?? undefined,
          concepts: params.memoryConceptFilter ? [params.memoryConceptFilter] : undefined,
        }
      : undefined,
  }
}

export function getDefaultSearchScope(
  mode: SearchMode,
  context: SearchContextResponse | null,
  activeSessionId: string | null,
): SearchScopeKind {
  if (mode !== 'everything') {
    return 'active-session'
  }

  if ((context?.sessions.length ?? 0) > 1) {
    return 'all-project-sessions'
  }

  const activeSession = context?.sessions.find((session) => session.sessionId === activeSessionId) ?? context?.sessions[0]
  if ((activeSession?.additionalDirs.length ?? 0) > 0) {
    return 'visible-roots'
  }

  return 'active-session'
}
