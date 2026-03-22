import { describe, expect, it } from 'vitest'
import { createObservation, createSessionSummary, PROJECT, SESSION, useMemoryStoreTestContext, WORKTREE_PATH } from './memory-store-test-helpers'

const context = useMemoryStoreTestContext()

describe('MemoryStore search behavior', () => {
  describe('FTS5 search on interactions', () => {
    it('finds interactions by text content', () => {
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'fix the authentication bug', 1000)
      context.store.insertInteraction(PROJECT, SESSION, 'agent', 'I updated the login handler', 2000)
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'deploy to staging', 3000)

      const rows = context.store.getDb(PROJECT)
        .prepare('SELECT i.* FROM interactions_fts f JOIN interactions i ON i.id = f.rowid WHERE interactions_fts MATCH ?')
        .all('authentication') as Array<Record<string, unknown>>

      expect(rows).toHaveLength(1)
      expect(rows[0].text).toBe('fix the authentication bug')
    })
  })

  describe('observations', () => {
    it('inserts and retrieves observations by session', () => {
      context.store.insertObservation(createObservation())

      const results = context.store.getObservationsBySession(PROJECT, SESSION)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('obs-1')
      expect(results[0].title).toBe('Chose SQLite over JSON')
      expect(results[0].facts).toEqual(['SQLite supports FTS5', 'JSON files do not scale'])
      expect(results[0].filesTouched).toEqual(['src/main/memory/memory-store.ts'])
    })

    it('searches observations via FTS5', () => {
      context.store.insertObservation(createObservation())
      context.store.insertObservation(createObservation({
        id: 'obs-2',
        title: 'Error handling strategy',
        summary: 'Use try-catch with custom error classes',
        facts: ['Custom errors improve debugging'],
      }))

      const result = context.store.searchObservations(PROJECT, 'SQLite')
      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('Chose SQLite over JSON')
    })

    it('sanitizes punctuation in observation queries', () => {
      context.store.insertObservation(createObservation({
        title: 'Authentication fix',
        summary: 'Fixed token validation in the login flow',
      }))

      const result = context.store.searchObservations(PROJECT, 'authentication?')

      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('Authentication fix')
    })

    it('filters observations by type', () => {
      context.store.insertObservation(createObservation())
      context.store.insertObservation(createObservation({
        id: 'obs-2',
        type: 'error_resolution',
        title: 'Fixed SQLite locking',
        summary: 'WAL mode fixed locking issues',
      }))

      const result = context.store.searchObservations(PROJECT, 'SQLite', { type: 'decision' })
      expect(result.results).toHaveLength(1)
      expect(result.results[0].type).toBe('decision')
    })

    it('filters observations by concept in searchObservations', () => {
      context.store.insertObservation(createObservation({
        id: 'obs-c1',
        type: 'bugfix',
        title: 'Auth bug fix',
        summary: 'Fixed authentication token validation',
        facts: [],
        concepts: ['problem-solution', 'gotcha'],
        filesTouched: [],
      }))
      context.store.insertObservation(createObservation({
        id: 'obs-c2',
        type: 'feature',
        title: 'Auth feature added',
        summary: 'Added new authentication endpoint',
        facts: [],
        concepts: ['what-changed'],
        filesTouched: [],
      }))

      const result = context.store.searchObservations(PROJECT, 'authentication', { concepts: ['gotcha'] })
      expect(result.results).toHaveLength(1)
      expect(result.results[0].id).toBe('obs-c1')
    })
  })

  describe('session summaries and combined search', () => {
    it('inserts and retrieves summaries', () => {
      context.store.insertSessionSummary(createSessionSummary())

      const results = context.store.getRecentSummaries(PROJECT)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('sum-1')
      expect(results[0].taskDescription).toBe('Implement memory persistence layer')
      expect(results[0].decisionsMade).toEqual(['Use WAL mode', 'Use porter tokenizer'])
      expect(results[0].filesChanged).toEqual(['memory-store.ts'])
    })

    it('returns results from both observations and summaries with provenance', () => {
      context.store.upsertSession(PROJECT, SESSION, 'claude', 'manifold/test', 'database work', WORKTREE_PATH)
      context.store.insertObservation(createObservation({
        type: 'architecture',
        title: 'Database architecture design',
        summary: 'SQLite with WAL mode for concurrent access',
        facts: ['WAL mode'],
        filesTouched: [],
      }))
      context.store.insertSessionSummary(createSessionSummary({
        taskDescription: 'Design database schema',
        whatWasDone: 'Created tables and indexes',
        whatWasLearned: 'FTS5 is powerful',
        decisionsMade: [],
        filesChanged: [],
      }))

      const result = context.store.search(PROJECT, 'database')
      expect(result.results.length).toBeGreaterThanOrEqual(2)
      expect(result.results[0]).toMatchObject({
        sessionId: SESSION,
        runtimeId: 'claude',
        branchName: 'manifold/test',
        worktreePath: WORKTREE_PATH,
      })
    })

    it('accepts natural-language questions with punctuation in combined search', () => {
      context.store.insertObservation(createObservation({
        title: 'Auth change overview',
        summary: 'Explained how the authentication flow works',
      }))

      const result = context.store.search(PROJECT, 'How does authentication work?')

      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('Auth change overview')
    })
  })
})
