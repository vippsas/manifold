import type { MemorySearchResult as LegacyMemorySearchResult } from '../../shared/memory-types'
import type { SearchQueryRequest, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'
import { isNoise, sanitizeMemoryText, truncate } from '../memory/memory-capture'
import { buildMemoryFtsQuery } from '../memory/store/memory-fts-query'
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
      if (request.scope.sessionIds && request.scope.sessionIds.length > 0) {
        return [...new Set(request.scope.sessionIds)]
          .map((sessionId) => sessionManager.getSession(sessionId))
          .filter((session): session is AgentSession => Boolean(session))
      }
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
  const ftsQuery = buildMemoryFtsQuery(request.query)
  if (!ftsQuery) return []

  const projectIds = resolveMemoryProjectIds(request)
  const limit = request.limit ?? 100
  const shouldPrefixIds = projectIds.length > 1
  const results: UnifiedSearchResult[] = []

  for (const projectId of projectIds) {
    const compressed = memoryStore.search(projectId, request.query, {
      type: request.memoryFilters?.type,
      runtimeId: request.memoryFilters?.runtimeId,
      concepts: request.memoryFilters?.concepts,
      limit,
    })

    results.push(...compressed.results.map((result) => mapMemoryResult(result, projectId, shouldPrefixIds)))

    const db = memoryStore.getDb(projectId)
    const shouldIncludeInteractionMatches = (
      !request.memoryFilters?.runtimeId &&
      !(request.memoryFilters?.concepts && request.memoryFilters.concepts.length > 0) &&
      (!request.memoryFilters?.type || request.memoryFilters.type === 'task_summary')
    )

    if (!shouldIncludeInteractionMatches) {
      continue
    }

    try {
      const interactionRows = db.prepare(`
        SELECT i.id, i.sessionId, i.role, i.text, i.timestamp, s.runtimeId, s.branchName, s.worktreePath, rank
        FROM interactions_fts f
        JOIN interactions i ON i.id = f.rowid
        LEFT JOIN sessions s ON s.sessionId = i.sessionId
        WHERE interactions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as InteractionRow[]

      for (const row of interactionRows) {
        const cleanText = sanitizeMemoryText(row.text)
        if (!cleanText || isNoise(cleanText)) continue
        results.push({
          id: toScopedMemoryId(projectId, `interaction-${row.id}`, shouldPrefixIds),
          source: 'memory',
          memorySource: 'interaction',
          title: row.role === 'user' ? 'You' : row.role === 'system' ? 'System' : 'Agent',
          snippet: truncate(cleanText, 220),
          score: row.rank,
          projectId,
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
      const leftProject = left.projectId ?? ''
      const rightProject = right.projectId ?? ''
      if (leftProject !== rightProject) return leftProject.localeCompare(rightProject)
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)
}

function mapMemoryResult(
  result: LegacyMemorySearchResult,
  projectId: string,
  shouldPrefixIds: boolean,
): UnifiedSearchResult {
  return {
    id: toScopedMemoryId(projectId, result.id, shouldPrefixIds),
    source: 'memory',
    memorySource: result.source,
    title: result.title,
    snippet: result.summary,
    score: result.rank,
    projectId,
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

function resolveMemoryProjectIds(request: SearchQueryRequest): string[] {
  const projectIds = request.scope.projectIds?.length
    ? request.scope.projectIds
    : [request.projectId]

  return [...new Set(projectIds.filter(Boolean))]
}

function toScopedMemoryId(projectId: string, id: string, shouldPrefixIds: boolean): string {
  return shouldPrefixIds ? `${projectId}:${id}` : id
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
