import { describe, it, expect } from 'vitest'
import { createRequestTracker } from './request-tracker'

describe('createRequestTracker', () => {
  it('correlates out-of-order replies by reqId', async () => {
    const tracker = createRequestTracker<string>()
    const a = tracker.begin()
    const b = tracker.begin()
    expect(b.reqId).toBeGreaterThan(a.reqId)
    tracker.resolve(b.reqId, 'second')
    tracker.resolve(a.reqId, 'first')
    await expect(a.promise).resolves.toBe('first')
    await expect(b.promise).resolves.toBe('second')
    expect(tracker.size).toBe(0)
  })

  it('allocates panel-wide unique reqIds across trackers', () => {
    const a = createRequestTracker<number>()
    const b = createRequestTracker<number>()
    const r1 = a.begin()
    const r2 = b.begin()
    expect(r1.reqId).not.toBe(r2.reqId)
    // settle to avoid dangling promises
    a.resolve(r1.reqId, 0)
    b.resolve(r2.reqId, 0)
  })

  it('ignores unknown reqIds', () => {
    const tracker = createRequestTracker<string>()
    expect(() => tracker.resolve(99999, 'x')).not.toThrow()
    expect(() => tracker.reject(99999, new Error('x'))).not.toThrow()
  })

  it('rejects with the given error and settles each reqId only once', async () => {
    const tracker = createRequestTracker<string>()
    const { reqId, promise } = tracker.begin()
    tracker.reject(reqId, new Error('boom'))
    tracker.resolve(reqId, 'late')
    await expect(promise).rejects.toThrow('boom')
    expect(tracker.size).toBe(0)
  })
})
