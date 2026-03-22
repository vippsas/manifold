import { describe, expect, it } from 'vitest'
import { createObservation, PROJECT, SESSION, useMemoryStoreTestContext } from './memory-store-test-helpers'

const context = useMemoryStoreTestContext()

describe('MemoryStore content fields', () => {
  describe('observations with narrative and concepts', () => {
    it('stores and retrieves narrative and concepts', () => {
      context.store.insertObservation(createObservation({
        id: 'obs-nc-1',
        type: 'bugfix',
        title: 'Fixed auth bug',
        summary: 'Token validation was missing expiry check',
        narrative: 'The login handler accepted expired tokens because the expiry field was never checked.',
        facts: ['Tokens expire after 24h'],
        concepts: ['problem-solution', 'gotcha'],
        filesTouched: ['src/auth/login.ts'],
      }))

      const results = context.store.getObservationsBySession(PROJECT, SESSION)
      expect(results).toHaveLength(1)
      expect(results[0].narrative).toBe('The login handler accepted expired tokens because the expiry field was never checked.')
      expect(results[0].concepts).toEqual(['problem-solution', 'gotcha'])
    })

    it('defaults narrative to empty string for old rows', () => {
      context.store.getDb(PROJECT).prepare(`
        INSERT INTO observations (id, projectId, sessionId, type, title, summary, facts, filesTouched, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('obs-old', PROJECT, SESSION, 'decision', 'Old obs', 'Old summary', '[]', '[]', Date.now())

      const observation = context.store.getObservationById(PROJECT, 'obs-old')
      expect(observation).not.toBeNull()
      expect(observation!.narrative).toBe('')
      expect(observation!.concepts).toEqual([])
    })
  })

  describe('recent observation ordering', () => {
    it('returns observations ordered by createdAt desc', () => {
      context.store.insertObservation(createObservation({ id: 'obs-r1', type: 'feature', title: 'First', summary: 'First obs', facts: [], filesTouched: [], createdAt: 1000 }))
      context.store.insertObservation(createObservation({ id: 'obs-r2', type: 'bugfix', title: 'Second', summary: 'Second obs', facts: [], filesTouched: [], createdAt: 2000 }))
      context.store.insertObservation(createObservation({ id: 'obs-r3', type: 'refactor', title: 'Third', summary: 'Third obs', facts: [], filesTouched: [], createdAt: 3000 }))

      const results = context.store.getRecentObservations(PROJECT, 2)
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('obs-r3')
      expect(results[1].id).toBe('obs-r2')
    })
  })

  describe('interactions with toolEvents', () => {
    it('stores and retrieves toolEvents', () => {
      context.store.insertInteraction(PROJECT, SESSION, 'agent', 'I read the file', 1000, [
        { toolName: 'Read', inputSummary: 'src/main/index.ts', timestamp: 1000 },
      ])

      const interactions = context.store.getSessionInteractions(PROJECT, SESSION)
      expect(interactions).toHaveLength(1)
      expect(interactions[0].toolEvents).toHaveLength(1)
      expect(interactions[0].toolEvents![0].toolName).toBe('Read')
      expect(interactions[0].toolEvents![0].inputSummary).toBe('src/main/index.ts')
    })

    it('defaults toolEvents to empty array for old rows', () => {
      context.store.insertInteraction(PROJECT, SESSION, 'user', 'hello', 1000)

      const interactions = context.store.getSessionInteractions(PROJECT, SESSION)
      expect(interactions).toHaveLength(1)
      expect(interactions[0].toolEvents).toEqual([])
    })
  })
})
