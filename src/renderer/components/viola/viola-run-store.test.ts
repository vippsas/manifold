import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViolaRun } from '../../../shared/viola'

function makeRun(state: ViolaRun['state'], taskState: string): ViolaRun {
  return {
    id: 'viola-1', baseSessionId: 's1', goal: 'g', summary: 's', state,
    availableRuntimes: ['claude', 'codex'], createdAt: 0,
    tasks: [{
      id: 't1', title: 'API', description: 'd', acceptance: ['a'], purpose: 'implement', gates: [],
      state: taskState as never, stateSince: 100,
    }],
  }
}

/** Captures the module-level listener the store registers on import. */
function bridge(): { emit: (payload: unknown) => void } {
  let handler: ((payload: unknown) => void) | undefined
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    on: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      if (channel === 'viola:run') handler = cb
      return () => { handler = undefined }
    }),
  }
  return { emit: (payload) => handler?.(payload) }
}

describe('viola run store', () => {
  beforeEach(() => vi.resetModules())

  it('keeps the latest snapshot per session so a remounted board is never stale', async () => {
    const { emit } = bridge()
    const store = await import('./viola-run-store')

    expect(store.getViolaRun('s1')).toBeUndefined()
    emit({ sessionId: 's1', run: makeRun('running', 'implementing') })
    expect(store.getViolaRun('s1')?.tasks[0].state).toBe('implementing')

    // A later update while no component is mounted still lands, so returning to the tab is current.
    emit({ sessionId: 's1', run: makeRun('running', 'reviewing') })
    expect(store.getViolaRun('s1')?.tasks[0].state).toBe('reviewing')
  })

  it('notifies subscribers on each update and stops after unsubscribe', async () => {
    const { emit } = bridge()
    const store = await import('./viola-run-store')
    const seen = vi.fn()

    const unsubscribe = store.subscribeViolaRuns(seen)
    emit({ sessionId: 's1', run: makeRun('running', 'implementing') })
    expect(seen).toHaveBeenCalledTimes(1)

    unsubscribe()
    emit({ sessionId: 's1', run: makeRun('running', 'reviewing') })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed payloads instead of throwing into the render tree', async () => {
    const { emit } = bridge()
    const store = await import('./viola-run-store')

    emit(undefined)
    emit({ sessionId: 's1' })
    emit({ run: makeRun('running', 'implementing') })

    expect(store.getViolaRun('s1')).toBeUndefined()
  })
})
