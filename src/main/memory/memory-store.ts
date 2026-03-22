import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  MemoryInteraction,
  MemoryObservation,
  MemorySearchResponse,
  MemoryStats,
  SessionSummary,
  ToolUseEvent,
} from '../../shared/memory-types'
import { applyMemoryStoreMigrations, MEMORY_STORE_SCHEMA_SQL } from './store/memory-store-schema'
import { parseInteractionRow, parseObservationRow, parseSessionSummaryRow } from './store/memory-store-parsers'
import { searchMemoryRecords, searchObservationRecords, type MemoryStoreSearchOptions } from './store/memory-store-search'

export class MemoryStore {
  private dbs = new Map<string, Database.Database>()
  private basePath: string

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(os.homedir(), '.manifold', 'memory')
  }

  getDb(projectId: string): Database.Database {
    const existing = this.dbs.get(projectId)
    if (existing) return existing

    fs.mkdirSync(this.basePath, { recursive: true })
    const dbPath = path.join(this.basePath, `${projectId}.db`)
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(MEMORY_STORE_SCHEMA_SQL)
    applyMemoryStoreMigrations(db)
    this.dbs.set(projectId, db)
    return db
  }

  upsertSession(
    projectId: string,
    sessionId: string,
    runtimeId: string,
    branchName: string,
    taskDescription?: string,
    worktreePath?: string | null,
  ): void {
    const db = this.getDb(projectId)
    db.prepare(`
      INSERT INTO sessions (sessionId, projectId, runtimeId, branchName, worktreePath, taskDescription, startedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sessionId) DO UPDATE SET
        runtimeId = excluded.runtimeId,
        branchName = excluded.branchName,
        worktreePath = COALESCE(excluded.worktreePath, sessions.worktreePath),
        taskDescription = COALESCE(excluded.taskDescription, sessions.taskDescription)
    `).run(sessionId, projectId, runtimeId, branchName, worktreePath ?? null, taskDescription ?? null, Date.now())
  }

  endSession(projectId: string, sessionId: string): void {
    this.getDb(projectId)
      .prepare('UPDATE sessions SET endedAt = ? WHERE sessionId = ?')
      .run(Date.now(), sessionId)
  }

  insertInteraction(
    projectId: string,
    sessionId: string,
    role: string,
    text: string,
    timestamp: number,
    toolEvents?: ToolUseEvent[],
  ): void {
    this.getDb(projectId)
      .prepare('INSERT INTO interactions (projectId, sessionId, role, text, timestamp, toolEvents) VALUES (?, ?, ?, ?, ?, ?)')
      .run(projectId, sessionId, role, text, timestamp, JSON.stringify(toolEvents ?? []))
  }

  insertObservation(observation: MemoryObservation): void {
    this.getDb(observation.projectId)
      .prepare(`
        INSERT OR REPLACE INTO observations (id, projectId, sessionId, type, title, summary, narrative, facts, concepts, filesTouched, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        observation.id,
        observation.projectId,
        observation.sessionId,
        observation.type,
        observation.title,
        observation.summary,
        observation.narrative ?? '',
        JSON.stringify(observation.facts),
        JSON.stringify(observation.concepts ?? []),
        JSON.stringify(observation.filesTouched),
        observation.createdAt,
      )
  }

  insertSessionSummary(summary: SessionSummary): void {
    this.getDb(summary.projectId)
      .prepare(`
        INSERT OR REPLACE INTO session_summaries
          (id, projectId, sessionId, runtimeId, branchName, taskDescription, whatWasDone, whatWasLearned, decisionsMade, filesChanged, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        summary.id,
        summary.projectId,
        summary.sessionId,
        summary.runtimeId,
        summary.branchName,
        summary.taskDescription,
        summary.whatWasDone,
        summary.whatWasLearned,
        JSON.stringify(summary.decisionsMade),
        JSON.stringify(summary.filesChanged),
        summary.createdAt,
      )
  }

  search(projectId: string, query: string, options?: MemoryStoreSearchOptions): MemorySearchResponse {
    return searchMemoryRecords(this.getDb(projectId), query, options)
  }

  getSessionInteractions(projectId: string, sessionId: string): MemoryInteraction[] {
    const rows = this.getDb(projectId)
      .prepare('SELECT * FROM interactions WHERE sessionId = ? ORDER BY timestamp ASC')
      .all(sessionId) as Array<Record<string, unknown>>
    return rows.map(parseInteractionRow)
  }

  getRecentInteractions(projectId: string, limit = 50): MemoryInteraction[] {
    const rows = this.getDb(projectId)
      .prepare('SELECT * FROM interactions ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>
    return rows.map(parseInteractionRow)
  }

  getRecentSummaries(projectId: string, limit = 10): SessionSummary[] {
    const rows = this.getDb(projectId)
      .prepare('SELECT * FROM session_summaries ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>
    return rows.map(parseSessionSummaryRow)
  }

  getObservationById(projectId: string, observationId: string): MemoryObservation | null {
    const row = this.getDb(projectId)
      .prepare('SELECT * FROM observations WHERE id = ?')
      .get(observationId) as Record<string, unknown> | undefined
    return row ? parseObservationRow(row) : null
  }

  deleteObservation(projectId: string, observationId: string): void {
    this.getDb(projectId).prepare('DELETE FROM observations WHERE id = ?').run(observationId)
  }

  getObservationsBySession(projectId: string, sessionId: string): MemoryObservation[] {
    const rows = this.getDb(projectId)
      .prepare('SELECT * FROM observations WHERE sessionId = ? ORDER BY createdAt ASC')
      .all(sessionId) as Array<Record<string, unknown>>
    return rows.map(parseObservationRow)
  }

  getRecentObservations(projectId: string, limit = 10): MemoryObservation[] {
    const rows = this.getDb(projectId)
      .prepare('SELECT * FROM observations ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>
    return rows.map(parseObservationRow)
  }

  searchObservations(projectId: string, query: string, options?: MemoryStoreSearchOptions): MemorySearchResponse {
    return searchObservationRecords(this.getDb(projectId), query, options)
  }

  getStats(projectId: string): MemoryStats {
    const row = this.getDb(projectId).prepare(`
      SELECT
        (SELECT COUNT(*) FROM interactions) AS totalInteractions,
        (SELECT MIN(timestamp) FROM interactions) AS oldestInteraction,
        (SELECT MAX(timestamp) FROM interactions) AS newestInteraction,
        (SELECT COUNT(*) FROM observations) AS totalObservations,
        (SELECT COUNT(*) FROM session_summaries) AS totalSummaries,
        (SELECT COUNT(*) FROM sessions) AS totalSessions
    `).get() as Omit<MemoryStats, 'projectId'>

    return { projectId, ...row }
  }

  prune(projectId: string, retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    this.getDb(projectId).prepare('DELETE FROM interactions WHERE timestamp < ?').run(cutoff)
  }

  pruneAll(retentionDays: number): void {
    if (!fs.existsSync(this.basePath)) return
    for (const file of fs.readdirSync(this.basePath).filter((entry) => entry.endsWith('.db'))) {
      this.prune(file.replace('.db', ''), retentionDays)
    }
  }

  deleteProject(projectId: string): void {
    const db = this.dbs.get(projectId)
    if (db) {
      db.close()
      this.dbs.delete(projectId)
    }

    const dbPath = path.join(this.basePath, `${projectId}.db`)
    removeIfExists(dbPath)
    removeIfExists(`${dbPath}-wal`)
    removeIfExists(`${dbPath}-shm`)
  }

  close(): void {
    for (const db of this.dbs.values()) {
      db.close()
    }
    this.dbs.clear()
  }
}

function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

export { parseInteractionRow, parseObservationRow, parseSessionSummaryRow } from './store/memory-store-parsers'
export type { MemoryStoreSearchOptions } from './store/memory-store-search'
