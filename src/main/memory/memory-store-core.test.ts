import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createObservation, createSessionSummary, PROJECT, SESSION, useMemoryStoreTestContext, WORKTREE_PATH } from './memory-store-test-helpers'

const context = useMemoryStoreTestContext()

describe('MemoryStore core behavior', () => {
  describe('DB creation', () => {
    it('creates a database file on first access', () => {
      context.store.getDb(PROJECT)
      expect(fs.existsSync(path.join(context.tmpDir, `${PROJECT}.db`))).toBe(true)
    })

    it('returns the same DB instance on repeated calls', () => {
      const first = context.store.getDb(PROJECT)
      const second = context.store.getDb(PROJECT)
      expect(first).toBe(second)
    })

    it('uses WAL journal mode', () => {
      const db = context.store.getDb(PROJECT)
      const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>
      expect(result[0].journal_mode).toBe('wal')
    })
  })

  describe('session upsert', () => {
    it('inserts a new session', () => {
      context.store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test', 'fix a bug', WORKTREE_PATH)

      const row = context.store.getDb(PROJECT)
        .prepare('SELECT * FROM sessions WHERE sessionId = ?')
        .get(SESSION) as Record<string, unknown>

      expect(row.projectId).toBe(PROJECT)
      expect(row.runtimeId).toBe('claude')
      expect(row.branchName).toBe('manifold/test')
      expect(row.worktreePath).toBe(WORKTREE_PATH)
      expect(row.taskDescription).toBe('fix a bug')
      expect(row.startedAt).toBeTypeOf('number')
      expect(row.endedAt).toBeNull()
    })

    it('updates an existing session on conflict', () => {
      context.store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test', 'task one')
      context.store.upsertSession(PROJECT, SESSION, 'codex', 'manifold/test2')

      const row = context.store.getDb(PROJECT)
        .prepare('SELECT * FROM sessions WHERE sessionId = ?')
        .get(SESSION) as Record<string, unknown>

      expect(row.runtimeId).toBe('codex')
      expect(row.branchName).toBe('manifold/test2')
      expect(row.taskDescription).toBe('task one')
    })

    it('ends a session with timestamp', () => {
      context.store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test')
      context.store.endSession(PROJECT, SESSION)

      const row = context.store.getDb(PROJECT)
        .prepare('SELECT * FROM sessions WHERE sessionId = ?')
        .get(SESSION) as Record<string, unknown>

      expect(row.endedAt).toBeTypeOf('number')
    })
  })

  describe('interactions', () => {
    it('inserts and retrieves interactions by session', () => {
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'hello world', 1000)
      context.store.insertInteraction(PROJECT, SESSION, 'agent', 'hi there', 2000)

      const results = context.store.getSessionInteractions(PROJECT, SESSION)
      expect(results).toHaveLength(2)
      expect(results[0].role).toBe('user')
      expect(results[0].text).toBe('hello world')
      expect(results[1].role).toBe('agent')
    })

    it('retrieves recent interactions across sessions', () => {
      context.store.insertInteraction(PROJECT, 'sess-a', 'user', 'msg a', 1000)
      context.store.insertInteraction(PROJECT, 'sess-b', 'user', 'msg b', 2000)
      context.store.insertInteraction(PROJECT, 'sess-c', 'user', 'msg c', 3000)

      const results = context.store.getRecentInteractions(PROJECT, 2)
      expect(results).toHaveLength(2)
      expect(results[0].text).toBe('msg c')
      expect(results[1].text).toBe('msg b')
    })
  })

  describe('pruning and lifecycle', () => {
    it('deletes interactions older than retention period', () => {
      const now = Date.now()
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'old message', now - 100 * 24 * 60 * 60 * 1000)
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'new message', now)

      context.store.prune(PROJECT, 30)
      const results = context.store.getSessionInteractions(PROJECT, SESSION)
      expect(results).toHaveLength(1)
      expect(results[0].text).toBe('new message')
    })

    it('pruneAll prunes across all projects', () => {
      const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000
      context.store.insertInteraction('proj-a', 's1', 'user', 'old', oldTimestamp)
      context.store.insertInteraction('proj-b', 's2', 'user', 'old', oldTimestamp)
      context.store.insertInteraction('proj-a', 's1', 'user', 'new', Date.now())

      context.store.pruneAll(30)
      expect(context.store.getSessionInteractions('proj-a', 's1')).toHaveLength(1)
      expect(context.store.getSessionInteractions('proj-b', 's2')).toHaveLength(0)
    })

    it('removes the database file', () => {
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'hello', Date.now())
      const dbPath = path.join(context.tmpDir, `${PROJECT}.db`)

      expect(fs.existsSync(dbPath)).toBe(true)
      context.store.deleteProject(PROJECT)
      expect(fs.existsSync(dbPath)).toBe(false)
    })

    it('closes all open databases', () => {
      context.store.getDb('proj-1')
      context.store.getDb('proj-2')
      context.store.close()

      const db = context.store.getDb('proj-1')
      expect(db).toBeDefined()
    })
  })

  describe('stats', () => {
    it('returns correct counts', () => {
      context.store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test')
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'msg 1', 1000)
      context.store.insertInteraction(PROJECT, SESSION, 'agent', 'msg 2', 2000)
      context.store.insertObservation(createObservation({ title: 'test', summary: 'test', facts: [], filesTouched: [] }))
      context.store.insertSessionSummary(createSessionSummary({
        taskDescription: 'test',
        whatWasDone: 'test',
        whatWasLearned: 'test',
        decisionsMade: [],
        filesChanged: [],
      }))

      const stats = context.store.getStats(PROJECT)
      expect(stats.projectId).toBe(PROJECT)
      expect(stats.totalInteractions).toBe(2)
      expect(stats.totalObservations).toBe(1)
      expect(stats.totalSummaries).toBe(1)
      expect(stats.totalSessions).toBe(1)
      expect(stats.oldestInteraction).toBe(1000)
      expect(stats.newestInteraction).toBe(2000)
    })

    it('returns null timestamps when no interactions exist', () => {
      const stats = context.store.getStats(PROJECT)
      expect(stats.totalInteractions).toBe(0)
      expect(stats.oldestInteraction).toBeNull()
      expect(stats.newestInteraction).toBeNull()
    })
  })
})
