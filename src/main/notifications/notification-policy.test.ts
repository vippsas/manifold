import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationPolicy } from './notification-policy'
import type { NotificationSettings } from '../../shared/types'

const ON: NotificationSettings = { enabled: true, onDone: true, onWaiting: true, onError: true, scope: 'always' }

function makePolicy(debounceMs = 2000): {
  policy: NotificationPolicy
  fired: Array<{ sessionId: string; status: string }>
} {
  const fired: Array<{ sessionId: string; status: string }> = []
  const policy = new NotificationPolicy((sessionId, status) => fired.push({ sessionId, status }), debounceMs)
  return { policy, fired }
}

describe('NotificationPolicy', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not fire on the first observed status (baseline)', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.runAllTimers()
    expect(fired).toEqual([])
  })

  it('fires once on a transition to a notify-worthy status after the debounce', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    expect(fired).toEqual([])
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'waiting' }])
  })

  it('does not re-fire when the same status is observed again', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'waiting' }])
  })

  it('cancels a pending notification when status flips back before the debounce (error flicker)', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'error', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(500)
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })

  it('respects the master enabled toggle', () => {
    const { policy, fired } = makePolicy()
    const off = { ...ON, enabled: false }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: off, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: off, windowFocused: false, activeSessionId: null })
    vi.runAllTimers()
    expect(fired).toEqual([])
  })

  it('respects a per-event toggle (onWaiting off suppresses waiting, not done)', () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, onWaiting: false }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: s, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: s, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: s, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'done' }])
  })

  it("scope 'unfocused' suppresses while the window is focused", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'unfocused' as const }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })

  it("scope 'non-active' suppresses the focused active session, notifies others", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'non-active' as const }
    policy.observe({ sessionId: 'active', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'active', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'bg', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'bg', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: 'active' })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 'bg', status: 'done' }])
  })

  it("scope 'non-active' notifies the active session when the window is unfocused", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'non-active' as const }
    policy.observe({ sessionId: 'active', newStatus: 'running', settings: s, windowFocused: false, activeSessionId: 'active' })
    policy.observe({ sessionId: 'active', newStatus: 'done', settings: s, windowFocused: false, activeSessionId: 'active' })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 'active', status: 'done' }])
  })

  it('re-fires waiting after the session runs again (re-arm after recovery)', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([
      { sessionId: 's1', status: 'waiting' },
      { sessionId: 's1', status: 'waiting' },
    ])
  })

  it('forget() drops pending timers and baseline for a session', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: ON, windowFocused: false, activeSessionId: null })
    policy.forget('s1')
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })
})
