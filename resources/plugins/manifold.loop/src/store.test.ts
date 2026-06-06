import { describe, it, expect } from 'vitest'
import { createLoopStore } from './store'
import type { LoopConfig, LoopStatus } from './types'

function fakeStorage(): { map: Map<string, unknown>; global: { get: <T>(k: string, d?: T) => Promise<T | undefined>; update: (k: string, v: unknown) => Promise<void> } } {
  const map = new Map<string, unknown>()
  return {
    map,
    global: {
      get: async <T>(key: string, dflt?: T) => (map.has(key) ? (map.get(key) as T) : dflt),
      update: async (key: string, value: unknown) => { map.set(key, value) },
    },
  }
}

const cfg = (sessionId: string): LoopConfig => ({
  sessionId, program: 'p', targetGlobs: [], evalCommand: 'e',
  metric: { kind: 'exit-code', direction: 'minimize' }, budgetSeconds: 30,
})
const st = (sessionId: string): LoopStatus => ({ sessionId, state: 'running', currentIteration: 2 })

describe('createLoopStore', () => {
  it('round-trips config keyed by session', async () => {
    const s = fakeStorage()
    const store = createLoopStore(s as never)
    expect(await store.getConfig('s1')).toBeNull()
    await store.setConfig('s1', cfg('s1'))
    expect((await store.getConfig('s1'))?.sessionId).toBe('s1')
    expect(await store.getConfig('s2')).toBeNull()
  })

  it('round-trips status and clears it', async () => {
    const s = fakeStorage()
    const store = createLoopStore(s as never)
    expect(await store.getStatus('s1')).toBeNull()
    await store.setStatus('s1', st('s1'))
    expect((await store.getStatus('s1'))?.state).toBe('running')
    await store.clearStatus('s1')
    expect(await store.getStatus('s1')).toBeNull()
  })
})
