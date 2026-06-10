import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from './verdict-store'
import type { VerdictRecord } from '../../shared/verdict-types'

function record(overrides: Partial<VerdictRecord> = {}): VerdictRecord {
  return {
    sessionId: 's1',
    projectId: 'p1',
    branch: 'manifold/foo',
    runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' },
    outcome: 'unknown',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('VerdictStore', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-store-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('upsert + getBySessionId round-trips', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'abc' }))
    expect(store.getBySessionId('abc')?.sessionId).toBe('abc')
  })

  it('upsert replaces the existing record for the same sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'abc', outcome: 'unknown' }))
    store.upsert(record({ sessionId: 'abc', outcome: 'merged' }))
    expect(store.getBySessionId('abc')?.outcome).toBe('merged')
    expect(store.listByProject('p1').length).toBe(1)
  })

  it('persists to disk and reloads on construction', () => {
    const file = path.join(tmp, 'v.json')
    const s1 = new VerdictStore(file)
    s1.upsert(record({ sessionId: 'abc' }))
    const s2 = new VerdictStore(file)
    expect(s2.getBySessionId('abc')?.sessionId).toBe('abc')
  })

  it('listByProject filters by projectId and respects limit', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'a', projectId: 'p1' }))
    store.upsert(record({ sessionId: 'b', projectId: 'p2' }))
    store.upsert(record({ sessionId: 'c', projectId: 'p1' }))
    expect(store.listByProject('p1').map((r) => r.sessionId).sort()).toEqual(['a', 'c'])
    expect(store.listByProject('p1', 1).length).toBe(1)
  })

  it('FIFO-evicts beyond 1000 records per project on write', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    for (let i = 0; i < 1005; i++) {
      store.upsert(record({ sessionId: `s${i}`, projectId: 'p1' }))
    }
    const list = store.listByProject('p1')
    expect(list.length).toBe(1000)
    expect(list.some((r) => r.sessionId === 's0')).toBe(false)
    expect(list.some((r) => r.sessionId === 's1004')).toBe(true)
  }, 30_000)

  it('returns null for missing sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    expect(store.getBySessionId('missing')).toBeNull()
  })

  it('deleteByProject drops every record for that project and persists', () => {
    const file = path.join(tmp, 'v.json')
    const store = new VerdictStore(file)
    store.upsert(record({ sessionId: 'a', projectId: 'p1' }))
    store.upsert(record({ sessionId: 'b', projectId: 'p2' }))
    store.upsert(record({ sessionId: 'c', projectId: 'p1' }))

    store.deleteByProject('p1')

    expect(store.listByProject('p1')).toEqual([])
    expect(store.listByProject('p2').map((r) => r.sessionId)).toEqual(['b'])
    // Persisted: a fresh instance does not resurrect p1's verdicts.
    const reloaded = new VerdictStore(file)
    expect(reloaded.listByProject('p1')).toEqual([])
    expect(reloaded.listByProject('p2').length).toBe(1)
  })

  it('deleteByProject is a no-op (no write) when nothing matches', () => {
    const file = path.join(tmp, 'v.json')
    const store = new VerdictStore(file)
    store.deleteByProject('absent')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('tolerates corrupt JSON on load (returns empty)', () => {
    const file = path.join(tmp, 'v.json')
    fs.writeFileSync(file, 'not json', 'utf-8')
    const store = new VerdictStore(file)
    expect(store.listByProject('p1')).toEqual([])
  })

  it('writes atomically (tmp + rename) and leaves no tmp file behind (#525)', () => {
    const file = path.join(tmp, 'v.json')
    const store = new VerdictStore(file)
    store.upsert(record({ sessionId: 'abc' }))
    // The destination exists and the sibling tmp has been renamed away.
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))[0].sessionId).toBe('abc')
  })
})
