import type { AgentSession } from '../../shared/types'
import type { SearchQueryRequest } from '../../shared/search-types'
import { attachContextToCodeResults, DEFAULT_CODE_SEARCH_CONTEXT_LINES } from './code-search-context'
import { searchWithGitGrepFallback } from './gitgrep-fallback'
import { isRipgrepUnavailable, searchWithRipgrep } from './ripgrep-engine'
import {
  buildCodeSearchRoots,
  sortAndLimitCodeResults,
  type CodeSearchResponse,
} from './search-engine'

const DEFAULT_LIMIT = 100

export async function searchCodeInSessions(
  sessions: AgentSession[],
  request: SearchQueryRequest,
): Promise<CodeSearchResponse> {
  const limit = request.limit ?? DEFAULT_LIMIT
  const roots = buildCodeSearchRoots(sessions, request)
  if (roots.length === 0 || !request.query.trim()) {
    return { results: [], warnings: [] }
  }

  try {
    const results = await searchWithRipgrep(roots, request, limit)
    const sortedResults = sortAndLimitCodeResults(results, limit)
    return {
      results: await attachContextToCodeResults(
        sortedResults,
        request.contextLines ?? DEFAULT_CODE_SEARCH_CONTEXT_LINES,
      ),
      warnings: [],
    }
  } catch (error: unknown) {
    if (!isRipgrepUnavailable(error)) throw error

    const fallback = await searchWithGitGrepFallback(roots, request, limit)
    const sortedResults = sortAndLimitCodeResults(fallback.results, limit)
    return {
      results: await attachContextToCodeResults(
        sortedResults,
        request.contextLines ?? DEFAULT_CODE_SEARCH_CONTEXT_LINES,
      ),
      warnings: ['Ripgrep is unavailable. Falling back to git grep.', ...fallback.warnings],
    }
  }
}
