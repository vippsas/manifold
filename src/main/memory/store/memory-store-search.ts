import type Database from 'better-sqlite3'
import type {
  MemorySearchResponse,
  MemorySearchResult,
  ObservationType,
} from '../../../shared/memory-types'
import { buildMemoryFtsQuery } from './memory-fts-query'
import { safeParseStringArray } from './memory-store-parsers'

export interface MemoryStoreSearchOptions {
  type?: ObservationType
  concepts?: string[]
  runtimeId?: string
  limit?: number
}

export function searchMemoryRecords(
  db: Database.Database,
  query: string,
  options?: MemoryStoreSearchOptions,
): MemorySearchResponse {
  const limit = options?.limit ?? 20
  const ftsQuery = buildMemoryFtsQuery(query)
  if (!ftsQuery) {
    return { results: [], total: 0 }
  }

  let observationResults = searchObservationRows(db, ftsQuery, limit)
  let summaryResults = searchSummaryRows(db, ftsQuery, limit)

  if (options?.type) {
    observationResults = observationResults.filter((result) => result.type === options.type)
    if (options.type !== 'task_summary') {
      summaryResults = []
    }
  }

  if (options?.concepts && options.concepts.length > 0) {
    const conceptSet = new Set(options.concepts)
    observationResults = observationResults.filter((result) =>
      result.concepts?.some((concept) => conceptSet.has(concept)) ?? false,
    )
    summaryResults = []
  }

  if (options?.runtimeId) {
    observationResults = []
    summaryResults = summaryResults.filter((result) => result.runtimeId === options.runtimeId)
  }

  const results = [...observationResults, ...summaryResults]
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
    .slice(0, limit)

  return { results, total: results.length }
}

export function searchObservationRecords(
  db: Database.Database,
  query: string,
  options?: MemoryStoreSearchOptions,
): MemorySearchResponse {
  const limit = options?.limit ?? 20
  const ftsQuery = buildMemoryFtsQuery(query)
  if (!ftsQuery) {
    return { results: [], total: 0 }
  }

  let sql = `
    SELECT o.id, o.type, o.title, o.summary, o.sessionId, s.runtimeId, s.branchName, s.worktreePath,
           o.createdAt, o.concepts, o.filesTouched, rank
    FROM observations_fts f
    JOIN observations o ON o.rowid = f.rowid
    LEFT JOIN sessions s ON s.sessionId = o.sessionId
    WHERE observations_fts MATCH ?
  `
  const params: unknown[] = [ftsQuery]

  if (options?.type) {
    sql += ' AND o.type = ?'
    params.push(options.type)
  }

  if (options?.concepts && options.concepts.length > 0) {
    const placeholders = options.concepts.map(() => '?').join(', ')
    sql += ` AND EXISTS (SELECT 1 FROM json_each(o.concepts) WHERE value IN (${placeholders}))`
    params.push(...options.concepts)
  }

  sql += ' ORDER BY rank LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as ObservationSearchRow[]
  const results = rows.map((row) => ({
    id: row.id,
    type: row.type,
    source: 'observation' as const,
    title: row.title,
    summary: row.summary,
    sessionId: row.sessionId,
    runtimeId: row.runtimeId ?? undefined,
    branchName: row.branchName ?? undefined,
    worktreePath: row.worktreePath ?? undefined,
    createdAt: row.createdAt,
    rank: row.rank,
    concepts: safeParseStringArray(row.concepts),
    filesTouched: safeParseStringArray(row.filesTouched),
  }))

  return { results, total: results.length }
}

interface ObservationSearchRow {
  id: string
  type: ObservationType
  title: string
  summary: string
  sessionId: string
  runtimeId: string | null
  branchName: string | null
  worktreePath: string | null
  createdAt: number
  concepts: string
  filesTouched: string
  rank: number
}

interface SessionSummarySearchRow {
  id: string
  sessionId: string
  runtimeId: string
  branchName: string
  worktreePath: string | null
  title: string
  summary: string
  createdAt: number
  rank: number
}

function searchObservationRows(
  db: Database.Database,
  query: string,
  limit: number,
): MemorySearchResult[] {
  const rows = db.prepare(`
    SELECT o.id, o.type, o.title, o.summary, o.sessionId, s.runtimeId, s.branchName, s.worktreePath,
           o.createdAt, o.concepts, o.filesTouched, rank
    FROM observations_fts f
    JOIN observations o ON o.rowid = f.rowid
    LEFT JOIN sessions s ON s.sessionId = o.sessionId
    WHERE observations_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as ObservationSearchRow[]

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    source: 'observation',
    title: row.title,
    summary: row.summary,
    sessionId: row.sessionId,
    runtimeId: row.runtimeId ?? undefined,
    branchName: row.branchName ?? undefined,
    worktreePath: row.worktreePath ?? undefined,
    createdAt: row.createdAt,
    rank: row.rank,
    concepts: safeParseStringArray(row.concepts),
    filesTouched: safeParseStringArray(row.filesTouched),
  }))
}

function searchSummaryRows(
  db: Database.Database,
  query: string,
  limit: number,
): MemorySearchResult[] {
  const rows = db.prepare(`
    SELECT s.id, s.sessionId, s.runtimeId, s.branchName, sessions.worktreePath,
           s.taskDescription AS title,
           s.whatWasDone AS summary, s.createdAt, rank
    FROM session_summaries_fts f
    JOIN session_summaries s ON s.rowid = f.rowid
    LEFT JOIN sessions ON sessions.sessionId = s.sessionId
    WHERE session_summaries_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as SessionSummarySearchRow[]

  return rows.map((row) => ({
    id: row.id,
    type: 'task_summary',
    source: 'session_summary',
    title: row.title,
    summary: row.summary,
    runtimeId: row.runtimeId,
    branchName: row.branchName,
    worktreePath: row.worktreePath ?? undefined,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    rank: row.rank,
  }))
}
