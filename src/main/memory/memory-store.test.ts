import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { MemoryStore } from './memory-store'
import type { MemoryObservation, SessionSummary } from '../../shared/memory-types'

let store: MemoryStore
let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-test-'))
  store = new MemoryStore(tmpDir)
})

afterEach(() => {
  store.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const PROJECT = 'test-project'
const SESSION = 'sess-1'

describe('MemoryStore', () => {
  describe('DB creation', () => {
    it('creates a database file on first access', () => {
      store.getDb(PROJECT)
      expect(fs.existsSync(path.join(tmpDir, `${PROJECT}.db`))).toBe(true)
    })

    it('returns the same DB instance on repeated calls', () => {
      const db1 = store.getDb(PROJECT)
      const db2 = store.getDb(PROJECT)
      expect(db1).toBe(db2)
    })

    it('uses WAL journal mode', () => {
      const db = store.getDb(PROJECT)
      const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>
      expect(result[0].journal_mode).toBe('wal')
    })
  })

  describe('session upsert', () => {
    it('inserts a new session', () => {
      store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test', 'fix a bug')
      const db = store.getDb(PROJECT)
      const row = db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(SESSION) as Record<string, unknown>
      expect(row.projectId).toBe(PROJECT)
      expect(row.runtimeId).toBe('claude')
      expect(row.branchName).toBe('manifold/test')
      expect(row.taskDescription).toBe('fix a bug')
      expect(row.startedAt).toBeTypeOf('number')
      expect(row.endedAt).toBeNull()
    })

    it('updates an existing session on conflict', () => {
      store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test', 'task one')
      store.upsertSession(PROJECT, SESSION, 'codex', 'manifold/test2')
      const db = store.getDb(PROJECT)
      const row = db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(SESSION) as Record<string, unknown>
      expect(row.runtimeId).toBe('codex')
      expect(row.branchName).toBe('manifold/test2')
      // taskDescription should keep original since new one is null
      expect(row.taskDescription).toBe('task one')
    })

    it('ends a session with timestamp', () => {
      store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test')
      store.endSession(PROJECT, SESSION)
      const db = store.getDb(PROJECT)
      const row = db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(SESSION) as Record<string, unknown>
      expect(row.endedAt).toBeTypeOf('number')
    })
  })

  describe('interactions', () => {
    it('inserts and retrieves interactions by session', () => {
      store.insertInteraction(PROJECT, SESSION, 'user', 'hello world', 1000)
      store.insertInteraction(PROJECT, SESSION, 'agent', 'hi there', 2000)
      const results = store.getSessionInteractions(PROJECT, SESSION)
      expect(results).toHaveLength(2)
      expect(results[0].role).toBe('user')
      expect(results[0].text).toBe('hello world')
      expect(results[1].role).toBe('agent')
    })

    it('retrieves recent interactions across sessions', () => {
      store.insertInteraction(PROJECT, 'sess-a', 'user', 'msg a', 1000)
      store.insertInteraction(PROJECT, 'sess-b', 'user', 'msg b', 2000)
      store.insertInteraction(PROJECT, 'sess-c', 'user', 'msg c', 3000)
      const results = store.getRecentInteractions(PROJECT, 2)
      expect(results).toHaveLength(2)
      // Most recent first
      expect(results[0].text).toBe('msg c')
      expect(results[1].text).toBe('msg b')
    })
  })

  describe('FTS5 search on interactions', () => {
    it('finds interactions by text content', () => {
      store.insertInteraction(PROJECT, SESSION, 'user', 'fix the authentication bug', 1000)
      store.insertInteraction(PROJECT, SESSION, 'agent', 'I updated the login handler', 2000)
      store.insertInteraction(PROJECT, SESSION, 'user', 'deploy to staging', 3000)

      const db = store.getDb(PROJECT)
      const rows = db
        .prepare('SELECT i.* FROM interactions_fts f JOIN interactions i ON i.id = f.rowid WHERE interactions_fts MATCH ?')
        .all('authentication') as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      expect(rows[0].text).toBe('fix the authentication bug')
    })
  })

  describe('observations', () => {
    const obs: MemoryObservation = {
      id: 'obs-1',
      projectId: PROJECT,
      sessionId: SESSION,
      type: 'decision',
      title: 'Chose SQLite over JSON',
      summary: 'We chose SQLite for persistence due to FTS5 support',
      facts: ['SQLite supports FTS5', 'JSON files do not scale'],
      filesTouched: ['src/main/memory/memory-store.ts'],
      createdAt: Date.now(),
    }

    it('inserts and retrieves observations by session', () => {
      store.insertObservation(obs)
      const results = store.getObservationsBySession(PROJECT, SESSION)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('obs-1')
      expect(results[0].title).toBe('Chose SQLite over JSON')
      expect(results[0].facts).toEqual(['SQLite supports FTS5', 'JSON files do not scale'])
      expect(results[0].filesTouched).toEqual(['src/main/memory/memory-store.ts'])
    })

    it('searches observations via FTS5', () => {
      store.insertObservation(obs)
      store.insertObservation({
        ...obs,
        id: 'obs-2',
        title: 'Error handling strategy',
        summary: 'Use try-catch with custom error classes',
        facts: ['Custom errors improve debugging'],
      })

      const result = store.searchObservations(PROJECT, 'SQLite')
      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('Chose SQLite over JSON')
    })

    it('filters observations by type', () => {
      store.insertObservation(obs)
      store.insertObservation({
        ...obs,
        id: 'obs-2',
        type: 'error_resolution',
        title: 'Fixed SQLite locking',
        summary: 'WAL mode fixed locking issues',
      })

      const result = store.searchObservations(PROJECT, 'SQLite', { type: 'decision' })
      expect(result.results).toHaveLength(1)
      expect(result.results[0].type).toBe('decision')
    })
  })

  describe('session summaries', () => {
    const summary: SessionSummary = {
      id: 'sum-1',
      projectId: PROJECT,
      sessionId: SESSION,
      runtimeId: 'claude',
      branchName: 'manifold/test',
      taskDescription: 'Implement memory persistence layer',
      whatWasDone: 'Created SQLite store with FTS5 search',
      whatWasLearned: 'FTS5 porter tokenizer handles stemming well',
      decisionsMade: ['Use WAL mode', 'Use porter tokenizer'],
      filesChanged: ['memory-store.ts'],
      createdAt: Date.now(),
    }

    it('inserts and retrieves summaries', () => {
      store.insertSessionSummary(summary)
      const results = store.getRecentSummaries(PROJECT)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('sum-1')
      expect(results[0].taskDescription).toBe('Implement memory persistence layer')
      expect(results[0].decisionsMade).toEqual(['Use WAL mode', 'Use porter tokenizer'])
      expect(results[0].filesChanged).toEqual(['memory-store.ts'])
    })

  })

  describe('combined search', () => {
    it('returns results from both observations and summaries', () => {
      store.insertObservation({
        id: 'obs-1',
        projectId: PROJECT,
        sessionId: SESSION,
        type: 'architecture',
        title: 'Database architecture design',
        summary: 'SQLite with WAL mode for concurrent access',
        facts: ['WAL mode'],
        filesTouched: [],
        createdAt: Date.now(),
      })
      store.insertSessionSummary({
        id: 'sum-1',
        projectId: PROJECT,
        sessionId: SESSION,
        runtimeId: 'claude',
        branchName: 'manifold/test',
        taskDescription: 'Design database schema',
        whatWasDone: 'Created tables and indexes',
        whatWasLearned: 'FTS5 is powerful',
        decisionsMade: [],
        filesChanged: [],
        createdAt: Date.now(),
      })

      const result = store.search(PROJECT, 'database')
      expect(result.results.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('pruning', () => {
    it('deletes interactions older than retention period', () => {
      const now = Date.now()
      const oldTimestamp = now - 100 * 24 * 60 * 60 * 1000 // 100 days ago
      store.insertInteraction(PROJECT, SESSION, 'user', 'old message', oldTimestamp)
      store.insertInteraction(PROJECT, SESSION, 'user', 'new message', now)

      store.prune(PROJECT, 30) // 30 days retention
      const results = store.getSessionInteractions(PROJECT, SESSION)
      expect(results).toHaveLength(1)
      expect(results[0].text).toBe('new message')
    })

    it('pruneAll prunes across all projects', () => {
      const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000
      store.insertInteraction('proj-a', 's1', 'user', 'old', oldTimestamp)
      store.insertInteraction('proj-b', 's2', 'user', 'old', oldTimestamp)
      store.insertInteraction('proj-a', 's1', 'user', 'new', Date.now())

      store.pruneAll(30)
      expect(store.getSessionInteractions('proj-a', 's1')).toHaveLength(1)
      expect(store.getSessionInteractions('proj-b', 's2')).toHaveLength(0)
    })
  })

  describe('stats', () => {
    it('returns correct counts', () => {
      store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test')
      store.insertInteraction(PROJECT, SESSION, 'user', 'msg 1', 1000)
      store.insertInteraction(PROJECT, SESSION, 'agent', 'msg 2', 2000)
      store.insertObservation({
        id: 'obs-1',
        projectId: PROJECT,
        sessionId: SESSION,
        type: 'decision',
        title: 'test',
        summary: 'test',
        facts: [],
        filesTouched: [],
        createdAt: Date.now(),
      })
      store.insertSessionSummary({
        id: 'sum-1',
        projectId: PROJECT,
        sessionId: SESSION,
        runtimeId: 'claude',
        branchName: 'manifold/test',
        taskDescription: 'test',
        whatWasDone: 'test',
        whatWasLearned: 'test',
        decisionsMade: [],
        filesChanged: [],
        createdAt: Date.now(),
      })

      const stats = store.getStats(PROJECT)
      expect(stats.projectId).toBe(PROJECT)
      expect(stats.totalInteractions).toBe(2)
      expect(stats.totalObservations).toBe(1)
      expect(stats.totalSummaries).toBe(1)
      expect(stats.totalSessions).toBe(1)
      expect(stats.oldestInteraction).toBe(1000)
      expect(stats.newestInteraction).toBe(2000)
    })

    it('returns null timestamps when no interactions exist', () => {
      const stats = store.getStats(PROJECT)
      expect(stats.totalInteractions).toBe(0)
      expect(stats.oldestInteraction).toBeNull()
      expect(stats.newestInteraction).toBeNull()
    })
  })

  describe('deleteProject', () => {
    it('removes the database file', () => {
      store.insertInteraction(PROJECT, SESSION, 'user', 'hello', Date.now())
      const dbPath = path.join(tmpDir, `${PROJECT}.db`)
      expect(fs.existsSync(dbPath)).toBe(true)

      store.deleteProject(PROJECT)
      expect(fs.existsSync(dbPath)).toBe(false)
    })
  })

  describe('close', () => {
    it('closes all open databases', () => {
      store.getDb('proj-1')
      store.getDb('proj-2')
      store.close()
      // After close, getting a DB should create a new connection
      const db = store.getDb('proj-1')
      expect(db).toBeDefined()
    })
  })
})
