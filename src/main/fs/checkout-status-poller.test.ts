import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckoutStatusPoller } from './checkout-status-poller'

function deferredStatus() {
  let reject!: (error: Error) => void
  const promise = new Promise<string>((_resolve, fail) => { reject = fail })
  return { promise, reject }
}

describe('CheckoutStatusPoller disabling requests', () => {
  let poller: CheckoutStatusPoller
  let statusCalls: string[]
  let nextStatus: Promise<string> | undefined
  const events = { primary: vi.fn(), additional: vi.fn(), branch: vi.fn() }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    statusCalls = []
    nextStatus = undefined
    poller = new CheckoutStatusPoller((checkout) => {
      statusCalls.push(checkout)
      const result = nextStatus ?? Promise.resolve('')
      nextStatus = undefined
      return result
    }, async () => 'main', events)
  })

  afterEach(() => {
    poller.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  describe.each([
    new Error('fatal: not a git repository'),
    Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT', syscall: 'spawn git' }),
  ])('after %s', (error) => {
    it.each(['primary', 'additional'])('keeps one timer when a new %s joins the pending request', async (role) => {
      const pending = deferredStatus()
      nextStatus = pending.promise
      poller.watch('/repo/a', 'existing')
      expect(statusCalls).toEqual(['/repo/a'])
      expect(vi.getTimerCount()).toBe(1)

      if (role === 'primary') poller.watch('/repo/a/', 'late')
      else poller.watchAdditionalDir('/repo/a/', 'late')
      await vi.advanceTimersByTimeAsync(4000)
      expect(statusCalls).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(1)

      pending.reject(error)
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(1)
      expect(events.primary).not.toHaveBeenCalled()
      expect(events.additional).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2000)
      expect(statusCalls).toEqual(['/repo/a', '/repo/a'])
      expect(events.primary).toHaveBeenCalledWith('/repo/a', 'existing',
        { changes: [], conflicts: [] }, expect.any(Function), false)
      if (role === 'primary') {
        expect(events.primary).toHaveBeenCalledWith('/repo/a', 'late',
          { changes: [], conflicts: [] }, expect.any(Function), false)
      } else {
        expect(events.additional).toHaveBeenCalledExactlyOnceWith('late', '/repo/a/',
          { changes: [], conflicts: [] })
      }
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(4000)
      expect(statusCalls).toHaveLength(4)
      expect(vi.getTimerCount()).toBe(1)
    })

    it('disables without a new subscriber and revives only for a new subscription', async () => {
      poller.watch('/repo/a', 'existing')
      poller.watchAdditionalDir('/repo/a/', 'existing-additional')
      await vi.advanceTimersByTimeAsync(0)
      const pending = deferredStatus()
      nextStatus = pending.promise
      await vi.advanceTimersByTimeAsync(2000)
      expect(statusCalls).toHaveLength(2)

      // Duplicate registrations cannot keep a permanently failing producer alive.
      poller.watch('/repo/a/', 'existing')
      poller.watchAdditionalDir('/repo/a', 'existing-additional')
      pending.reject(error)
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(6000)
      expect(statusCalls).toHaveLength(2)

      poller.watch('/repo/a', 'existing')
      poller.watchAdditionalDir('/repo/a', 'existing-additional')
      await vi.advanceTimersByTimeAsync(2000)
      expect(statusCalls).toHaveLength(2)
      expect(vi.getTimerCount()).toBe(0)

      events.primary.mockClear()
      poller.watch('/repo/a', 'new')
      await vi.advanceTimersByTimeAsync(0)
      expect(statusCalls).toHaveLength(3)
      expect(events.primary).toHaveBeenCalledWith('/repo/a', 'new',
        { changes: [], conflicts: [] }, expect.any(Function), false)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(statusCalls).toHaveLength(4)
      expect(vi.getTimerCount()).toBe(1)
    })
  })

  it('retries a transient rejection on the next tick without adding another interval', async () => {
    const pending = deferredStatus()
    nextStatus = pending.promise
    poller.watch('/repo/a', 'existing')
    pending.reject(new Error('temporarily unavailable'))
    await vi.advanceTimersByTimeAsync(0)
    expect(statusCalls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(statusCalls).toHaveLength(2)
    expect(events.primary).toHaveBeenCalledWith('/repo/a', 'existing',
      { changes: [], conflicts: [] }, expect.any(Function), false)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(statusCalls).toHaveLength(4)
    expect(vi.getTimerCount()).toBe(1)
  })
})
