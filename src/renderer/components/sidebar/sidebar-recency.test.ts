import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { sortByRecency, useProjectRecency } from './sidebar-recency'

function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  } as Storage)
  return store
}

beforeEach(() => {
  installLocalStorage()
})

describe('sortByRecency', () => {
  it('orders touched projects most-recent first', () => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const sorted = sortByRecency(projects, { b: 200, c: 300 })
    expect(sorted.map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('keeps the incoming order for never-touched projects', () => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const sorted = sortByRecency(projects, {})
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('pins the active project first, however stale its last visit', () => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const sorted = sortByRecency(projects, { b: 200, c: 300 }, 'a')
    expect(sorted.map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the rest in recency order when nothing is active', () => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const sorted = sortByRecency(projects, { b: 200, c: 300 }, null)
    expect(sorted.map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('useProjectRecency', () => {
  it('persists touches and restores them on remount', () => {
    const first = renderHook(() => useProjectRecency())
    act(() => first.result.current.touchProject('p2'))
    first.unmount()

    const second = renderHook(() => useProjectRecency())
    expect(second.result.current.recency.p2).toBeTypeOf('number')
  })

  // Touching moves a project to the front of the live order straight away, so
  // the one you just left is the row under the one you are in — and only that
  // one moves; the rest keep the order they were already in.
  it('re-orders the live list when a project is touched', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useProjectRecency())

      vi.setSystemTime(1_000)
      act(() => result.current.touchProject('p3'))
      vi.setSystemTime(2_000)
      act(() => result.current.touchProject('p1'))
      vi.setSystemTime(3_000)
      act(() => result.current.touchProject('p2'))

      const order = sortByRecency([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], result.current.recency)
      expect(order.map((p) => p.id)).toEqual(['p2', 'p1', 'p3'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps several touches in one session, newest last-write-wins', () => {
    const first = renderHook(() => useProjectRecency())
    act(() => first.result.current.touchProject('p1'))
    act(() => first.result.current.touchProject('p2'))
    first.unmount()

    const second = renderHook(() => useProjectRecency())
    expect(second.result.current.recency.p1).toBeTypeOf('number')
    expect(second.result.current.recency.p2).toBeTypeOf('number')
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', 'not-json{')
    const { result } = renderHook(() => useProjectRecency())
    expect(result.current.recency).toEqual({})
  })
})
