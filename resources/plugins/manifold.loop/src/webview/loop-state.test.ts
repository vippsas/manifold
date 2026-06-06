import { describe, it, expect } from 'vitest'
import { applyHostMsg, EMPTY_LOOP_STATE } from './loop-state'

describe('applyHostMsg', () => {
  it('init replaces everything', () => {
    const s = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: { sessionId: 's1', state: 'idle', currentIteration: 0 }, iterations: [{ index: 1, startedAt: 0, outcome: 'improved' }], config: null })
    expect(s.sessionId).toBe('s1')
    expect(s.iterations.length).toBe(1)
  })
  it('status updates only status', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    const s = applyHostMsg(base, { type: 'status', status: { sessionId: 's1', state: 'running', currentIteration: 2 } })
    expect(s.status?.state).toBe('running')
    expect(s.sessionId).toBe('s1')
  })
  it('iteration appends', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    const s = applyHostMsg(base, { type: 'iteration', iteration: { index: 1, startedAt: 0, outcome: 'failed' } })
    expect(s.iterations.length).toBe(1)
  })
  it('ignores aiResult/restoreResult/actionError (handled outside the reducer)', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    expect(applyHostMsg(base, { type: 'aiResult', ok: true, text: 'x' })).toBe(base)
  })
})
