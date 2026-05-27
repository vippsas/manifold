import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { ChatStore } from './chat-store'
import type { ChatMessage } from '../../shared/simple-types'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)

function msg(id: string, sessionId: string, text: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id, sessionId, role, text, timestamp: Date.parse('2026-01-01') + Number(id.replace(/\D/g, '') || 0) }
}

describe('ChatStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadFromDisk', () => {
    it('returns an empty Map when the file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ChatStore()
      expect(store.get('any-key')).toBeNull()
    })

    it('discards v1-format data (no version field) so older project-keyed history does not pollute new sessions', () => {
      mockExistsSync.mockReturnValue(true)
      // v1 was a bare projectId → messages map; it has no `version` key.
      mockReadFileSync.mockReturnValue(JSON.stringify({
        'project-a': [msg('1', 's-old', 'leaked from sibling session')],
      }))
      const store = new ChatStore()
      expect(store.get('project-a')).toBeNull()
    })

    it('discards stored data that has a different STORE_VERSION', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        version: 99,
        entries: { 'wt-a': { projectId: 'p1', messages: [msg('1', 's1', 'hi')] } },
      }))
      const store = new ChatStore()
      expect(store.get('wt-a')).toBeNull()
    })

    it('loads a v2 file round-trip', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        version: 2,
        entries: {
          '/wt/a': { projectId: 'p1', messages: [msg('m1', 's1', 'hello')] },
          '/wt/b': { projectId: 'p2', messages: [msg('m2', 's2', 'world')] },
        },
      }))
      const store = new ChatStore()
      expect(store.get('/wt/a')?.[0].text).toBe('hello')
      expect(store.get('/wt/b')?.[0].text).toBe('world')
    })

    it('returns an empty Map when the file is malformed JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{ not json')
      const store = new ChatStore()
      expect(store.get('anything')).toBeNull()
    })
  })

  describe('set / get', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false)
    })

    it('stores and retrieves messages by storage key', () => {
      const store = new ChatStore()
      store.set('/wt/a', 'p1', [msg('1', 's1', 'hi')])
      expect(store.get('/wt/a')?.[0].text).toBe('hi')
    })

    it('isolates two storage keys that share a projectId — fixes the cross-session bleed', () => {
      const store = new ChatStore()
      store.set('/wt/alpha', 'p1', [msg('1', 's-alpha', 'alpha')])
      store.set('/wt/bravo', 'p1', [msg('2', 's-bravo', 'bravo')])
      expect(store.get('/wt/alpha')?.map((m) => m.text)).toEqual(['alpha'])
      expect(store.get('/wt/bravo')?.map((m) => m.text)).toEqual(['bravo'])
    })

    it('caps stored messages at 200 per key (keeps the most recent)', () => {
      const store = new ChatStore()
      const messages = Array.from({ length: 250 }, (_, i) => msg(`m${i}`, 's1', `t${i}`))
      store.set('/wt/a', 'p1', messages)
      const got = store.get('/wt/a')!
      expect(got).toHaveLength(200)
      expect(got[0].text).toBe('t50')
      expect(got[199].text).toBe('t249')
    })

    it('returns cloned messages so callers cannot mutate internal state', () => {
      const store = new ChatStore()
      store.set('/wt/a', 'p1', [msg('1', 's1', 'original')])
      const first = store.get('/wt/a')!
      first[0].text = 'mutated'
      expect(store.get('/wt/a')![0].text).toBe('original')
    })

    it('writes a versioned file on set', () => {
      const store = new ChatStore()
      store.set('/wt/a', 'p1', [msg('1', 's1', 'hi')])
      const written = JSON.parse(mockWriteFileSync.mock.calls.at(-1)![1] as string)
      expect(written.version).toBe(2)
      expect(written.entries['/wt/a'].projectId).toBe('p1')
    })
  })

  describe('deleteByProject', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false)
    })

    it('removes only entries whose projectId matches', () => {
      const store = new ChatStore()
      store.set('/wt/alpha', 'p1', [msg('1', 's1', 'a')])
      store.set('/wt/bravo', 'p1', [msg('2', 's2', 'b')])
      store.set('/wt/cosmo', 'p2', [msg('3', 's3', 'c')])

      store.deleteByProject('p1')

      expect(store.get('/wt/alpha')).toBeNull()
      expect(store.get('/wt/bravo')).toBeNull()
      expect(store.get('/wt/cosmo')?.[0].text).toBe('c')
    })

    it('does not write to disk when no entries match', () => {
      const store = new ChatStore()
      store.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      mockWriteFileSync.mockClear()

      store.deleteByProject('nonexistent-project')

      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('removes a single storage key', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ChatStore()
      store.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      store.delete('/wt/a')
      expect(store.get('/wt/a')).toBeNull()
    })
  })
})
