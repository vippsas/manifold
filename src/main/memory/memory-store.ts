import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type {
  MemoryObservation,
  SessionSummary,
  MemoryInteraction,
  MemorySessionRow,
  MemoryStats,
  MemorySearchResult,
  MemorySearchResponse,
  ObservationType,
} from '../../shared/memory-types'

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    runtimeId TEXT NOT NULL,
    branchName TEXT NOT NULL,
    taskDescription TEXT,
    startedAt INTEGER NOT NULL,
    endedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(sessionId);
  CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);

  CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    text,
    content='interactions',
    content_rowid='id',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, text) VALUES (new.id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, text) VALUES('delete', old.id, old.text);
  END;

  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    facts TEXT NOT NULL DEFAULT '[]',
    filesTouched TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(sessionId);

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title,
    summary,
    facts,
    content='observations',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, summary, facts) VALUES (new.rowid, new.title, new.summary, new.facts);
  END;

  CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, summary, facts) VALUES('delete', old.rowid, old.title, old.summary, old.facts);
  END;

  CREATE TABLE IF NOT EXISTS session_summaries (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    runtimeId TEXT NOT NULL,
    branchName TEXT NOT NULL,
    taskDescription TEXT NOT NULL,
    whatWasDone TEXT NOT NULL,
    whatWasLearned TEXT NOT NULL,
    decisionsMade TEXT NOT NULL DEFAULT '[]',
    filesChanged TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(sessionId);

  CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
    taskDescription,
    whatWasDone,
    whatWasLearned,
    content='session_summaries',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS summaries_ai AFTER INSERT ON session_summaries BEGIN
    INSERT INTO session_summaries_fts(rowid, taskDescription, whatWasDone, whatWasLearned)
      VALUES (new.rowid, new.taskDescription, new.whatWasDone, new.whatWasLearned);
  END;

  CREATE TRIGGER IF NOT EXISTS summaries_ad AFTER DELETE ON session_summaries BEGIN
    INSERT INTO session_summaries_fts(session_summaries_fts, rowid, taskDescription, whatWasDone, whatWasLearned)
      VALUES('delete', old.rowid, old.taskDescription, old.whatWasDone, old.whatWasLearned);
  END;
`

interface SearchOptions {
  type?: ObservationType
  runtimeId?: string
  limit?: number
}

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
    db.exec(SCHEMA_SQL)
    this.dbs.set(projectId, db)
    return db
  }

  upsertSession(
    projectId: string,
    sessionId: string,
    runtimeId: string,
    branchName: string,
    taskDescription?: string,
  ): void {
    const db = this.getDb(projectId)
    db.prepare(`
      INSERT INTO sessions (sessionId, projectId, runtimeId, branchName, taskDescription, startedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sessionId) DO UPDATE SET
        runtimeId = excluded.runtimeId,
        branchName = excluded.branchName,
        taskDescription = COALESCE(excluded.taskDescription, sessions.taskDescription)
    `).run(sessionId, projectId, runtimeId, branchName, taskDescription ?? null, Date.now())
  }

  endSession(projectId: string, sessionId: string): void {
    const db = this.getDb(projectId)
    db.prepare('UPDATE sessions SET endedAt = ? WHERE sessionId = ?').run(Date.now(), sessionId)
  }

  insertInteraction(
    projectId: string,
    sessionId: string,
    role: string,
    text: string,
    timestamp: number,
  ): void {
    const db = this.getDb(projectId)
    db.prepare(
      'INSERT INTO interactions (projectId, sessionId, role, text, timestamp) VALUES (?, ?, ?, ?, ?)',
    ).run(projectId, sessionId, role, text, timestamp)
  }

  insertObservation(observation: MemoryObservation): void {
    const db = this.getDb(observation.projectId)
    db.prepare(`
      INSERT OR REPLACE INTO observations (id, projectId, sessionId, type, title, summary, facts, filesTouched, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      observation.id,
      observation.projectId,
      observation.sessionId,
      observation.type,
      observation.title,
      observation.summary,
      JSON.stringify(observation.facts),
      JSON.stringify(observation.filesTouched),
      observation.createdAt,
    )
  }

  insertSessionSummary(summary: SessionSummary): void {
    const db = this.getDb(summary.projectId)
    db.prepare(`
      INSERT OR REPLACE INTO session_summaries
        (id, projectId, sessionId, runtimeId, branchName, taskDescription, whatWasDone, whatWasLearned, decisionsMade, filesChanged, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

  search(projectId: string, query: string, options?: SearchOptions): MemorySearchResponse {
    const db = this.getDb(projectId)
    const limit = options?.limit ?? 20

    // Search observations via FTS5
    const obsRows = db.prepare(`
      SELECT o.id, o.type, o.title, o.summary, o.sessionId, o.createdAt,
             rank
      FROM observations_fts f
      JOIN observations o ON o.rowid = f.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{
      id: string
      type: ObservationType
      title: string
      summary: string
      sessionId: string
      createdAt: number
      rank: number
    }>

    // Search summaries via FTS5
    const sumRows = db.prepare(`
      SELECT s.id, s.sessionId, s.runtimeId, s.taskDescription AS title,
             s.whatWasDone AS summary, s.createdAt, rank
      FROM session_summaries_fts f
      JOIN session_summaries s ON s.rowid = f.rowid
      WHERE session_summaries_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{
      id: string
      sessionId: string
      runtimeId: string
      title: string
      summary: string
      createdAt: number
      rank: number
    }>

    let results: MemorySearchResult[] = [
      ...obsRows.map((r) => ({
        id: r.id,
        type: r.type,
        source: 'observation' as const,
        title: r.title,
        summary: r.summary,
        sessionId: r.sessionId,
        createdAt: r.createdAt,
        rank: r.rank,
      })),
      ...sumRows.map((r) => ({
        id: r.id,
        type: 'task_summary' as ObservationType,
        source: 'session_summary' as const,
        title: r.title,
        summary: r.summary,
        runtimeId: r.runtimeId,
        sessionId: r.sessionId,
        createdAt: r.createdAt,
        rank: r.rank,
      })),
    ]

    // Apply optional filters
    if (options?.type) {
      results = results.filter((r) => r.type === options.type)
    }
    if (options?.runtimeId) {
      results = results.filter((r) => r.runtimeId === options.runtimeId)
    }

    results.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    results = results.slice(0, limit)

    return { results, total: results.length }
  }

  getSessionInteractions(projectId: string, sessionId: string): MemoryInteraction[] {
    const db = this.getDb(projectId)
    return db
      .prepare('SELECT * FROM interactions WHERE sessionId = ? ORDER BY timestamp ASC')
      .all(sessionId) as MemoryInteraction[]
  }

  getRecentInteractions(projectId: string, limit = 50): MemoryInteraction[] {
    const db = this.getDb(projectId)
    return db
      .prepare('SELECT * FROM interactions ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as MemoryInteraction[]
  }

  getRecentSummaries(projectId: string, limit = 10): SessionSummary[] {
    const db = this.getDb(projectId)
    const rows = db
      .prepare('SELECT * FROM session_summaries ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>
    return rows.map(parseSessionSummaryRow)
  }

  getObservationById(projectId: string, observationId: string): MemoryObservation | null {
    const db = this.getDb(projectId)
    const row = db
      .prepare('SELECT * FROM observations WHERE id = ?')
      .get(observationId) as Record<string, unknown> | undefined
    return row ? parseObservationRow(row) : null
  }

  deleteObservation(projectId: string, observationId: string): void {
    const db = this.getDb(projectId)
    db.prepare('DELETE FROM observations WHERE id = ?').run(observationId)
  }

  getObservationsBySession(projectId: string, sessionId: string): MemoryObservation[] {
    const db = this.getDb(projectId)
    const rows = db
      .prepare('SELECT * FROM observations WHERE sessionId = ? ORDER BY createdAt ASC')
      .all(sessionId) as Array<Record<string, unknown>>
    return rows.map(parseObservationRow)
  }

  searchObservations(projectId: string, query: string, options?: SearchOptions): MemorySearchResponse {
    const db = this.getDb(projectId)
    const limit = options?.limit ?? 20

    let sql = `
      SELECT o.id, o.type, o.title, o.summary, o.sessionId, o.createdAt, rank
      FROM observations_fts f
      JOIN observations o ON o.rowid = f.rowid
      WHERE observations_fts MATCH ?
    `
    const params: unknown[] = [query]

    if (options?.type) {
      sql += ' AND o.type = ?'
      params.push(options.type)
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(limit)

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string
      type: ObservationType
      title: string
      summary: string
      sessionId: string
      createdAt: number
      rank: number
    }>

    const results: MemorySearchResult[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      source: 'observation',
      title: r.title,
      summary: r.summary,
      sessionId: r.sessionId,
      createdAt: r.createdAt,
      rank: r.rank,
    }))

    return { results, total: results.length }
  }

  getStats(projectId: string): MemoryStats {
    const db = this.getDb(projectId)

    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM interactions) AS totalInteractions,
        (SELECT MIN(timestamp) FROM interactions) AS oldestInteraction,
        (SELECT MAX(timestamp) FROM interactions) AS newestInteraction,
        (SELECT COUNT(*) FROM observations) AS totalObservations,
        (SELECT COUNT(*) FROM session_summaries) AS totalSummaries,
        (SELECT COUNT(*) FROM sessions) AS totalSessions
    `).get() as {
      totalInteractions: number
      oldestInteraction: number | null
      newestInteraction: number | null
      totalObservations: number
      totalSummaries: number
      totalSessions: number
    }

    return { projectId, ...row }
  }

  prune(projectId: string, retentionDays: number): void {
    const db = this.getDb(projectId)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    db.prepare('DELETE FROM interactions WHERE timestamp < ?').run(cutoff)
  }

  pruneAll(retentionDays: number): void {
    if (!fs.existsSync(this.basePath)) return
    const files = fs.readdirSync(this.basePath).filter((f) => f.endsWith('.db'))
    for (const file of files) {
      const projectId = file.replace('.db', '')
      this.prune(projectId, retentionDays)
    }
  }

  deleteProject(projectId: string): void {
    const db = this.dbs.get(projectId)
    if (db) {
      db.close()
      this.dbs.delete(projectId)
    }
    const dbPath = path.join(this.basePath, `${projectId}.db`)
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    // Clean up WAL/SHM files
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
  }

  close(): void {
    for (const db of this.dbs.values()) {
      db.close()
    }
    this.dbs.clear()
  }
}

export function parseObservationRow(row: Record<string, unknown>): MemoryObservation {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    sessionId: row.sessionId as string,
    type: row.type as MemoryObservation['type'],
    title: row.title as string,
    summary: row.summary as string,
    facts: JSON.parse(row.facts as string),
    filesTouched: JSON.parse(row.filesTouched as string),
    createdAt: row.createdAt as number,
  }
}

export function parseSessionSummaryRow(row: Record<string, unknown>): SessionSummary {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    sessionId: row.sessionId as string,
    runtimeId: row.runtimeId as string,
    branchName: row.branchName as string,
    taskDescription: row.taskDescription as string,
    whatWasDone: row.whatWasDone as string,
    whatWasLearned: row.whatWasLearned as string,
    decisionsMade: JSON.parse(row.decisionsMade as string),
    filesChanged: JSON.parse(row.filesChanged as string),
    createdAt: row.createdAt as number,
  }
}
