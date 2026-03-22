import { ipcMain } from 'electron'
import type { ProjectSearchViewState } from '../../shared/search-view-state'
import type {
  SearchAskRequest,
  SearchAskResponse,
  SearchContextResponse,
  SearchQueryRequest,
  SearchQueryResponse,
  UnifiedSearchResult,
} from '../../shared/search-types'
import { getSearchContext } from '../search/search-context-service'
import { answerSearchQuestion } from '../search/ai-search-service'
import { executeSearchQuery } from '../search/search-query-service'
import { maybeRerankSearchResults } from '../search/search-rerank-service'
import type { IpcDependencies } from './types'

const AI_SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'between',
  'by',
  'chose',
  'choose',
  'chosen',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'over',
  'should',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'this',
  'to',
  'use',
  'used',
  'using',
  'vs',
  'versus',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
  'would',
  'you',
  'your',
])

export function registerSearchHandlers(deps: IpcDependencies): void {
  const { sessionManager, memoryStore, settingsStore, projectRegistry, gitOps, searchViewStore } = deps

  ipcMain.handle('search:context', async (_event, projectId: string, activeSessionId: string | null): Promise<SearchContextResponse> => {
    return getSearchContext(sessionManager, projectId, activeSessionId)
  })

  ipcMain.handle('search:view-state:get', (_event, projectId: string): ProjectSearchViewState => {
    return searchViewStore.get(projectId)
  })

  ipcMain.handle('search:view-state:set', (_event, projectId: string, viewState: ProjectSearchViewState): void => {
    searchViewStore.set(projectId, viewState)
  })

  ipcMain.handle('search:query', async (_event, request: SearchQueryRequest): Promise<SearchQueryResponse> => {
    const exact = await executeSearchQuery({ sessionManager, memoryStore }, request)
    return maybeRerankSearchResults(
      { settingsStore, projectRegistry, sessionManager, gitOps },
      request,
      exact,
    )
  })

  ipcMain.handle('search:ask', async (_event, request: SearchAskRequest): Promise<SearchAskResponse> => {
    const normalizedRequest = {
      ...request,
      question: request.question.trim() || request.search.query,
    }
    const retrieval = await executeAskRetrieval(
      { sessionManager, memoryStore },
      normalizedRequest.search,
      normalizedRequest.question,
    )
    return answerSearchQuestion(
      { settingsStore, projectRegistry, sessionManager, gitOps },
      normalizedRequest,
      retrieval,
    )
  })
}

async function executeAskRetrieval(
  deps: Pick<IpcDependencies, 'sessionManager' | 'memoryStore'>,
  search: SearchQueryRequest,
  question: string,
): Promise<SearchQueryResponse> {
  const exact = await executeSearchQuery(deps, search)
  if (exact.results.length > 0) {
    return exact
  }

  const fallbackQueries = buildAskFallbackQueries(search, question)
  if (fallbackQueries.length === 0) {
    return exact
  }

  const responses = await Promise.all(fallbackQueries.map((query) => executeSearchQuery(deps, query)))
  const merged = mergeAskFallbackResponses(search.mode, responses, search.limit ?? 100)
  if (merged.results.length === 0) {
    return exact
  }

  return merged
}

function buildAskFallbackQueries(search: SearchQueryRequest, question: string): SearchQueryRequest[] {
  const keywords = extractAskKeywords(question)
  if (keywords.length === 0) {
    return []
  }

  const queries: SearchQueryRequest[] = []

  if (search.mode !== 'memory') {
    queries.push({
      ...search,
      mode: 'code',
      query: keywords.map(escapeRegexToken).join('|'),
      matchMode: 'regex',
      wholeWord: false,
      memoryFilters: undefined,
    })
  }

  if (search.mode !== 'code') {
    queries.push({
      ...search,
      mode: 'memory',
      query: keywords.join(' '),
      scope: { kind: 'memory-only' },
      matchMode: 'literal',
      wholeWord: false,
    })
  }

  return queries
}

function extractAskKeywords(question: string): string[] {
  const matches = question.normalize('NFKC').match(/[\p{L}\p{N}_-]+/gu) ?? []
  const ranked = new Map<string, { token: string; count: number; index: number }>()

  for (const rawToken of matches) {
    const token = rawToken.replace(/^-+|-+$/g, '')
    const normalized = token.toLocaleLowerCase()
    if (!token || token.length < 2 || AI_SEARCH_STOPWORDS.has(normalized)) {
      continue
    }

    const existing = ranked.get(normalized)
    if (existing) {
      existing.count += 1
      continue
    }

    ranked.set(normalized, {
      token,
      count: 1,
      index: ranked.size,
    })
  }

  return [...ranked.values()]
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count
      if (left.token.length !== right.token.length) return right.token.length - left.token.length
      return left.index - right.index
    })
    .slice(0, 6)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.token)
}

function escapeRegexToken(token: string): string {
  return token.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}

function mergeAskFallbackResponses(
  mode: SearchQueryRequest['mode'],
  responses: SearchQueryResponse[],
  limit: number,
): SearchQueryResponse {
  const warnings = responses.flatMap((response) => response.warnings ?? [])
  const resultsByKey = new Map<string, UnifiedSearchResult>()

  for (const response of responses) {
    for (const result of response.results) {
      if (!resultsByKey.has(result.id)) {
        resultsByKey.set(result.id, result)
      }
    }
  }

  const results = [...resultsByKey.values()]
    .sort((left, right) => {
      if (mode === 'everything' && left.source !== right.source) {
        return left.source === 'code' ? -1 : 1
      }

      const leftScore = left.score ?? 0
      const rightScore = right.score ?? 0
      if (leftScore !== rightScore) return leftScore - rightScore
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)

  return {
    results,
    total: results.length,
    tookMs: responses.reduce((sum, response) => sum + response.tookMs, 0),
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
