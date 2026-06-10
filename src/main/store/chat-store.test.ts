import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ChatStore } from './chat-store'
import type { ChatMessage } from '../../shared/simple-types'

function msg(id: string, sessionId: string, text: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id, sessionId, role, text, timestamp: Date.parse('2026-01-01') + Number(id.replace(/\D/g, '') || 0) }
}

let baseDir: string
const chatDir = () => path.join(baseDir, 'chat')
const legacyFile = () => path.join(baseDir, 'chat-history.json')
const sessionFiles = () => fs.readdirSync(chatDir()).filter(f => f.endsWith('.json'))

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatstore-'))
})

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true })
})

describe('ChatStore', () => {
  describe('set / get (in-memory, synchronous reads)', () => {
    it('stores and retrieves messages by storage key', () => {
      const store = new ChatStore(baseDir)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'hi')])
      expect(store.get('/wt/a')?.[0].text).toBe('hi')
    })

    it('returns null for an unknown key', () => {
      const store = new ChatStore(baseDir)
      expect(store.get('/wt/missing')).toBeNull()
    })

    it('isolates two storage keys that share a projectId', () => {
      const store = new ChatStore(baseDir)
      store.set('/wt/alpha', 'p1', [msg('1', 's-alpha', 'alpha')])
      store.set('/wt/bravo', 'p1', [msg('2', 's-bravo', 'bravo')])
      expect(store.get('/wt/alpha')?.map(m => m.text)).toEqual(['alpha'])
      expect(store.get('/wt/bravo')?.map(m => m.text)).toEqual(['bravo'])
    })

    it('caps stored messages at 200 per key (keeps the most recent)', () => {
      const store = new ChatStore(baseDir)
      const messages = Array.from({ length: 250 }, (_, i) => msg(`m${i}`, 's1', `t${i}`))
      store.set('/wt/a', 'p1', messages)
      const got = store.get('/wt/a')!
      expect(got).toHaveLength(200)
      expect(got[0].text).toBe('t50')
      expect(got[199].text).toBe('t249')
    })

    it('returns cloned messages so callers cannot mutate internal state', () => {
      const store = new ChatStore(baseDir)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'original')])
      store.get('/wt/a')![0].text = 'mutated'
      expect(store.get('/wt/a')![0].text).toBe('original')
    })
  })

  describe('deferred, per-session-file persistence', () => {
    it('does not touch disk synchronously on set (write is debounced)', () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'hi')])
      expect(fs.existsSync(chatDir())).toBe(false)
    })

    it('writes one file per storage key after flush', async () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      store.set('/wt/b', 'p2', [msg('2', 's2', 'b')])
      await store.flush()
      expect(sessionFiles()).toHaveLength(2)
    })

    it('flushing one dirty key does not rewrite another key file', async () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      await store.flush()
      const aFile = path.join(chatDir(), sessionFiles()[0])
      // Externally remove A's file; if B's later flush rewrites everything, A reappears.
      fs.unlinkSync(aFile)

      store.set('/wt/b', 'p2', [msg('2', 's2', 'b')])
      await store.flush()

      expect(fs.existsSync(aFile)).toBe(false)
      expect(sessionFiles()).toHaveLength(1)
    })
  })

  describe('durability across instances', () => {
    it('persists after an async flush and reloads in a new instance', async () => {
      const s1 = new ChatStore(baseDir, 10_000)
      s1.set('/wt/a', 'p1', [msg('1', 's1', 'persisted')])
      await s1.flush()
      const s2 = new ChatStore(baseDir)
      expect(s2.get('/wt/a')?.[0].text).toBe('persisted')
    })

    it('flushSync persists synchronously for the quit path', () => {
      const s1 = new ChatStore(baseDir, 10_000)
      s1.set('/wt/a', 'p1', [msg('1', 's1', 'on-quit')])
      s1.flushSync()
      const s2 = new ChatStore(baseDir)
      expect(s2.get('/wt/a')?.[0].text).toBe('on-quit')
    })

    it('ignores a corrupt session file on load', async () => {
      const s1 = new ChatStore(baseDir, 10_000)
      s1.set('/wt/a', 'p1', [msg('1', 's1', 'good')])
      await s1.flush()
      fs.writeFileSync(path.join(chatDir(), 'garbage.json'), '{ not json', 'utf-8')
      const s2 = new ChatStore(baseDir)
      expect(s2.get('/wt/a')?.[0].text).toBe('good')
    })
  })

  describe('delete / deleteByProject', () => {
    it('delete removes a key and its file', async () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      await store.flush()
      store.delete('/wt/a')
      await store.flush()
      expect(store.get('/wt/a')).toBeNull()
      expect(sessionFiles()).toHaveLength(0)
    })

    it('deleteByProject removes only files whose projectId matches', async () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/alpha', 'p1', [msg('1', 's1', 'a')])
      store.set('/wt/bravo', 'p1', [msg('2', 's2', 'b')])
      store.set('/wt/cosmo', 'p2', [msg('3', 's3', 'c')])
      await store.flush()

      store.deleteByProject('p1')
      await store.flush()

      expect(store.get('/wt/alpha')).toBeNull()
      expect(store.get('/wt/bravo')).toBeNull()
      expect(store.get('/wt/cosmo')?.[0].text).toBe('c')
      expect(sessionFiles()).toHaveLength(1)
    })
  })

  describe('migration from the legacy chat-history.json', () => {
    it('splits a legacy v2 file into per-session files and removes the legacy file', () => {
      fs.mkdirSync(baseDir, { recursive: true })
      fs.writeFileSync(legacyFile(), JSON.stringify({
        version: 2,
        entries: {
          '/wt/a': { projectId: 'p1', messages: [msg('1', 's1', 'a')] },
          '/wt/b': { projectId: 'p2', messages: [msg('2', 's2', 'b')] },
        },
      }), 'utf-8')

      const store = new ChatStore(baseDir)

      expect(store.get('/wt/a')?.[0].text).toBe('a')
      expect(store.get('/wt/b')?.[0].text).toBe('b')
      expect(fs.existsSync(legacyFile())).toBe(false)
      expect(sessionFiles()).toHaveLength(2)
    })

    it('does not load unrecognized v1 data but preserves it as a .bak (never deletes)', () => {
      fs.mkdirSync(baseDir, { recursive: true })
      const body = JSON.stringify({
        'project-a': [msg('1', 's-old', 'leaked from sibling session')],
      })
      fs.writeFileSync(legacyFile(), body, 'utf-8')

      const store = new ChatStore(baseDir)

      // v1 (project-keyed) data is intentionally not loaded into new sessions...
      expect(store.get('project-a')).toBeNull()
      // ...but the original file is preserved (moved aside), never destroyed.
      expect(fs.existsSync(legacyFile())).toBe(false)
      expect(fs.readFileSync(`${legacyFile()}.bak`, 'utf-8')).toBe(body)
    })

    it('preserves the legacy file as a .bak after a successful v2 migration', () => {
      fs.mkdirSync(baseDir, { recursive: true })
      const body = JSON.stringify({
        version: 2,
        entries: { '/wt/a': { projectId: 'p1', messages: [msg('1', 's1', 'a')] } },
      })
      fs.writeFileSync(legacyFile(), body, 'utf-8')

      new ChatStore(baseDir)

      expect(fs.existsSync(legacyFile())).toBe(false)
      expect(fs.readFileSync(`${legacyFile()}.bak`, 'utf-8')).toBe(body)
    })
  })

  describe('startup retention pruning (#530)', () => {
    it('prunes session files older than the retention window on load', async () => {
      const s1 = new ChatStore(baseDir, 10_000)
      s1.set('/wt/old', 'p1', [msg('1', 's1', 'stale')])
      s1.set('/wt/fresh', 'p1', [msg('2', 's2', 'recent')])
      await s1.flush()
      expect(sessionFiles()).toHaveLength(2)

      // Age the "old" file's mtime well past a 1-day retention window.
      const files = fs.readdirSync(chatDir()).filter((f) => f.endsWith('.json'))
      const oldFile = files.find((f) => {
        const parsed = JSON.parse(fs.readFileSync(path.join(chatDir(), f), 'utf-8'))
        return parsed.storageKey === '/wt/old'
      })!
      const past = Date.now() - 5 * 24 * 60 * 60 * 1000
      fs.utimesSync(path.join(chatDir(), oldFile), past / 1000, past / 1000)

      const retention = 24 * 60 * 60 * 1000 // 1 day
      const s2 = new ChatStore(baseDir, 10_000, retention)
      expect(s2.get('/wt/old')).toBeNull()
      expect(s2.get('/wt/fresh')?.[0].text).toBe('recent')
      // The stale file is deleted from disk, not merely skipped.
      expect(sessionFiles()).toHaveLength(1)
    })

    it('keeps all files when none are older than the window', async () => {
      const s1 = new ChatStore(baseDir, 10_000)
      s1.set('/wt/a', 'p1', [msg('1', 's1', 'a')])
      await s1.flush()
      const s2 = new ChatStore(baseDir, 10_000, 24 * 60 * 60 * 1000)
      expect(s2.get('/wt/a')?.[0].text).toBe('a')
      expect(sessionFiles()).toHaveLength(1)
    })
  })

  describe('overlapping flushes (#531)', () => {
    it('serializes concurrent flushes for the same key without truncation', async () => {
      const store = new ChatStore(baseDir, 10_000)
      // Schedule a write, then mutate the same key and trigger a second flush
      // while the first is still in flight.
      store.set('/wt/a', 'p1', [msg('1', 's1', 'first')])
      const p1 = store.flush()
      store.set('/wt/a', 'p1', [msg('2', 's1', 'second')])
      const p2 = store.flush()
      await Promise.all([p1, p2])

      // Exactly one file, parseable, holding the last write — never truncated/mixed.
      expect(sessionFiles()).toHaveLength(1)
      const reloaded = new ChatStore(baseDir, 10_000)
      expect(reloaded.get('/wt/a')?.map((m) => m.text)).toEqual(['second'])
      // No leftover .tmp files.
      expect(fs.readdirSync(chatDir()).some((f) => f.includes('.tmp'))).toBe(false)
    })

    it('flushSync during a pending async flush leaves a consistent file', async () => {
      const store = new ChatStore(baseDir, 10_000)
      store.set('/wt/a', 'p1', [msg('1', 's1', 'async')])
      const pending = store.flush()
      store.set('/wt/a', 'p1', [msg('2', 's1', 'sync')])
      store.flushSync()
      await pending

      expect(sessionFiles()).toHaveLength(1)
      const reloaded = new ChatStore(baseDir, 10_000)
      const texts = reloaded.get('/wt/a')?.map((m) => m.text)
      // Last-writer-wins; the file is always one consistent version, never mixed.
      expect(texts === undefined ? undefined : texts.length).toBe(1)
      expect(fs.readdirSync(chatDir()).some((f) => f.includes('.tmp'))).toBe(false)
    })
  })
})
