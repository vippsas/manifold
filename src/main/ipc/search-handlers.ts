import { ipcMain } from 'electron'
import type { MemorySearchResult as LegacyMemorySearchResult } from '../../shared/memory-types'
import type { SearchAskResponse, SearchContextResponse, SearchQueryRequest, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'
import { sanitizeMemoryText, isNoise } from '../memory/memory-capture'
import { getSearchContext } from '../search/search-context-service'
import { searchCodeInSessions } from '../search/code-search-service'
import type { IpcDependencies } from './types'

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength
    ? text.slice(0, maxLength - 3) + '...'
    : text
}

function getInteractionRoleLabel(role: string): string {
  return role === 'user'
    ? 'You'
    : role === 'system'
      ? 'System'
      : 'Agent'
}

export function registerSearchHandlers(deps: IpcDependencies): void {
  const { sessionManager, memoryStore } = deps

  ipcMain.handle('search:context', async (_event, projectId: string, activeSessionId: string | null): Promise<SearchContextResponse> => {
    return getSearchContext(sessionManager, projectId, activeSessionId)
  })

  ipcMain.handle('search:query', async (_event, request: SearchQueryRequest): Promise<SearchQueryResponse> => {
    const startedAt = Date.now()
    const warnings: string[] = []

    const sessions = await resolveScopeSessions(sessionManager, request)

    const codeResponse = request.mode === 'memory'
      ? { results: [], warnings: [] }
      : (await searchCodeInSessions(sessions, request))
    warnings.push(...codeResponse.warnings)

    const memoryDecision = shouldSearchMemory(request)
    if (memoryDecision.warning) {
      warnings.push(memoryDecision.warning)
    }

    const memoryResults = memoryDecision.enabled
      ? searchMemory(memoryStore, request)
      : []

    const merged = mergeResults(request.mode, codeResponse.results, memoryResults, request.limit ?? 100)
    return {
      results: merged,
      total: merged.length,
      tookMs: Date.now() - startedAt,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  })

  ipcMain.handle('search:ask', async (): Promise<SearchAskResponse> => {
    throw new Error('AI search is not implemented yet.')
  })
}

function shouldSearchMemory(request: SearchQueryRequest): { enabled: boolean; warning?: string } {
  if (request.mode === 'code') {
    return { enabled: false }
  }

  if (request.mode === 'everything' && request.matchMode === 'regex') {
    return {
      enabled: false,
      warning: 'Memory search does not support regex. Showing code results only.',
    }
  }

  return { enabled: true }
}

async function resolveScopeSessions(
  sessionManager: IpcDependencies['sessionManager'],
  request: SearchQueryRequest,
): Promise<AgentSession[]> {
  switch (request.scope.kind) {
    case 'all-project-sessions':
      return sessionManager.discoverSessionsForProject(request.projectId)
    case 'active-session':
    case 'visible-roots': {
      if (!request.activeSessionId) return []
      const session = sessionManager.getSession(request.activeSessionId)
      return session ? [session] : []
    }
    case 'memory-only':
      return []
  }
}

function searchMemory(
  memoryStore: IpcDependencies['memoryStore'],
  request: SearchQueryRequest,
): UnifiedSearchResult[] {
  if (!request.query.trim()) return []

  const limit = request.limit ?? 100
  const compressed = memoryStore.search(request.projectId, request.query, {
    type: undefined,
    runtimeId: undefined,
    concepts: undefined,
    limit,
  })

  const results: UnifiedSearchResult[] = compressed.results.map(mapMemoryResult)

  const db = memoryStore.getDb(request.projectId)
  try {
    const interactionRows = db.prepare(`
      SELECT i.id, i.sessionId, i.role, i.text, i.timestamp, rank
      FROM interactions_fts f
      JOIN interactions i ON i.id = f.rowid
      WHERE interactions_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(request.query, limit) as Array<{
      id: number
      sessionId: string
      role: string
      text: string
      timestamp: number
      rank: number
    }>

    for (const row of interactionRows) {
      const cleanText = sanitizeMemoryText(row.text)
      if (!cleanText || isNoise(cleanText)) continue
      results.push({
        id: `interaction-${row.id}`,
        source: 'memory',
        memorySource: 'interaction',
        title: getInteractionRoleLabel(row.role),
        snippet: truncate(cleanText, 220),
        score: row.rank,
        sessionId: row.sessionId,
        createdAt: row.timestamp,
      })
    }
  } catch {
    // Ignore FTS syntax errors for now; compressed results still work.
  }

  return results
    .sort((left, right) => {
      const leftScore = left.score ?? 0
      const rightScore = right.score ?? 0
      if (leftScore !== rightScore) return leftScore - rightScore
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)
}

function mapMemoryResult(result: LegacyMemorySearchResult): UnifiedSearchResult {
  return {
    id: result.id,
    source: 'memory',
    memorySource: result.source,
    title: result.title,
    snippet: result.summary,
    score: result.rank,
    sessionId: result.sessionId,
    runtimeId: result.runtimeId,
    createdAt: result.createdAt,
  }
}

function mergeResults(
  mode: SearchQueryRequest['mode'],
  codeResults: UnifiedSearchResult[],
  memoryResults: UnifiedSearchResult[],
  limit: number,
): UnifiedSearchResult[] {
  if (mode === 'code') return codeResults.slice(0, limit)
  if (mode === 'memory') return memoryResults.slice(0, limit)

  return [...codeResults, ...memoryResults]
    .sort((left, right) => {
      if (left.source !== right.source) return left.source === 'code' ? -1 : 1
      const leftScore = left.score ?? 0
      const rightScore = right.score ?? 0
      if (leftScore !== rightScore) return leftScore - rightScore
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)
}
