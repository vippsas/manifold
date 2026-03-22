import type { MemorySearchResult as LegacyMemorySearchResult } from '../../shared/memory-types'
import type { SearchQueryRequest, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'
import { isNoise, sanitizeMemoryText, truncate } from '../memory/memory-capture'
import { searchCodeInSessions } from './code-search-service'
import type { IpcDependencies } from '../ipc/types'

interface SearchQueryDeps {
  sessionManager: IpcDependencies['sessionManager']
  memoryStore: IpcDependencies['memoryStore']
}

export async function executeSearchQuery(
  deps: SearchQueryDeps,
  request: SearchQueryRequest,
): Promise<SearchQueryResponse> {
  const startedAt = Date.now()
  const warnings: string[] = []
  const sessions = await resolveScopeSessions(deps.sessionManager, request)

  const codeResponse = request.mode === 'memory'
    ? { results: [], warnings: [] }
    : (await searchCodeInSessions(sessions, request))
  warnings.push(...codeResponse.warnings)

  const memoryDecision = shouldSearchMemory(request)
  if (memoryDecision.warning) {
    warnings.push(memoryDecision.warning)
  }

  const memoryResults = memoryDecision.enabled
    ? searchMemory(deps.memoryStore, request)
    : []

  const merged = mergeResults(request.mode, codeResponse.results, memoryResults, request.limit ?? 100)
  return {
    results: merged,
    total: merged.length,
    tookMs: Date.now() - startedAt,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

function shouldSearchMemory(request: SearchQueryRequest): { enabled: boolean; warning?: string } {
  if (request.mode === 'code') {
    return { enabled: false }
  }
  if (request.mode === 'memory' && request.matchMode === 'regex') {
    return { enabled: false, warning: 'Memory search does not support regex. Switch to literal mode.' }
  }
  if (request.mode === 'everything' && request.matchMode === 'regex') {
    return { enabled: false, warning: 'Memory search does not support regex. Showing code results only.' }
  }
  return { enabled: true }
}

async function resolveScopeSessions(
  sessionManager: SearchQueryDeps['sessionManager'],
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
  memoryStore: SearchQueryDeps['memoryStore'],
  request: SearchQueryRequest,
): UnifiedSearchResult[] {
  if (!request.query.trim()) return []

  const limit = request.limit ?? 100
  const compressed = memoryStore.search(request.projectId, request.query, {
    type: request.memoryFilters?.type,
    runtimeId: request.memoryFilters?.runtimeId,
    concepts: request.memoryFilters?.concepts,
    limit,
  })

  const results: UnifiedSearchResult[] = compressed.results.map(mapMemoryResult)
  const db = memoryStore.getDb(request.projectId)
  const shouldIncludeInteractionMatches = (
    !request.memoryFilters?.runtimeId &&
    !(request.memoryFilters?.concepts && request.memoryFilters.concepts.length > 0) &&
    (!request.memoryFilters?.type || request.memoryFilters.type === 'task_summary')
  )

  if (shouldIncludeInteractionMatches) {
    try {
      const interactionRows = db.prepare(`
        SELECT i.id, i.sessionId, i.role, i.text, i.timestamp, s.runtimeId, s.branchName, s.worktreePath, rank
        FROM interactions_fts f
        JOIN interactions i ON i.id = f.rowid
        LEFT JOIN sessions s ON s.sessionId = i.sessionId
        WHERE interactions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(request.query, limit) as InteractionRow[]

      for (const row of interactionRows) {
        const cleanText = sanitizeMemoryText(row.text)
        if (!cleanText || isNoise(cleanText)) continue
        results.push({
          id: `interaction-${row.id}`,
          source: 'memory',
          memorySource: 'interaction',
          title: row.role === 'user' ? 'You' : row.role === 'system' ? 'System' : 'Agent',
          snippet: truncate(cleanText, 220),
          score: row.rank,
          sessionId: row.sessionId,
          branchName: row.branchName ?? undefined,
          runtimeId: row.runtimeId ?? undefined,
          worktreePath: row.worktreePath ?? undefined,
          createdAt: row.timestamp,
          observationType: 'task_summary',
        })
      }
    } catch {
      // Ignore FTS syntax errors; compressed results still work.
    }
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
    branchName: result.branchName,
    runtimeId: result.runtimeId,
    worktreePath: result.worktreePath,
    createdAt: result.createdAt,
    observationType: result.type,
    concepts: result.concepts,
    filesTouched: result.filesTouched,
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

interface InteractionRow {
  id: number
  sessionId: string
  role: string
  text: string
  timestamp: number
  runtimeId: string | null
  branchName: string | null
  worktreePath: string | null
  rank: number
}

