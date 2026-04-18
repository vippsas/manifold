import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { SuperagentStore } from './superagent-store'
import type { Superagent } from '../../shared/superagent-types'

function makeSuperagent(overrides: Partial<Superagent> = {}): Superagent {
  return {
    id: 's1',
    name: 'test',
    taskDescription: 'desc',
    runtimeId: 'claude',
    fleetProjectIds: ['p1'],
    childSessionIds: [],
    coordinationPath: '/tmp/coord',
    createdAt: '2026-04-18T00:00:00.000Z',
    pid: null,
    status: 'running',
    autoApprove: false,
    ...overrides,
  }
}

describe('SuperagentStore', () => {
  let tmpDir: string
  let storePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-store-'))
    storePath = path.join(tmpDir, 'superagents.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty list when no file exists', () => {
    const store = new SuperagentStore(storePath)
    expect(store.list()).toEqual([])
  })

  it('persists and reloads superagents', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1' }))
    store.add(makeSuperagent({ id: 's2', name: 'other' }))
    const reloaded = new SuperagentStore(storePath)
    expect(reloaded.list().map((s) => s.id).sort()).toEqual(['s1', 's2'])
  })

  it('updates a superagent by id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1', status: 'running' }))
    const updated = store.update('s1', { status: 'done' })
    expect(updated?.status).toBe('done')
    expect(store.get('s1')?.status).toBe('done')
  })

  it('returns undefined when updating missing id', () => {
    const store = new SuperagentStore(storePath)
    expect(store.update('missing', { status: 'done' })).toBeUndefined()
  })

  it('removes a superagent by id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1' }))
    expect(store.remove('s1')).toBe(true)
    expect(store.list()).toEqual([])
  })

  it('appends a child session id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1', childSessionIds: [] }))
    store.addChild('s1', 'child-1')
    expect(store.get('s1')?.childSessionIds).toEqual(['child-1'])
  })

  it('tolerates a malformed file by starting empty', () => {
    fs.writeFileSync(storePath, 'not json')
    const store = new SuperagentStore(storePath)
    expect(store.list()).toEqual([])
  })
})
