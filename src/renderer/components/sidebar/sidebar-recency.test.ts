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
})

describe('useProjectRecency', () => {
  it('persists touches and restores them on remount', () => {
    const first = renderHook(() => useProjectRecency())
    act(() => first.result.current.touchProject('p2'))
    first.unmount()

    const second = renderHook(() => useProjectRecency())
    expect(second.result.current.recency.p2).toBeTypeOf('number')
  })

  // Touching records the visit for next time; it must not re-sort the list the
  // user is clicking in.
  it('holds the order it started with when a project is touched', () => {
    const { result } = renderHook(() => useProjectRecency())
    const before = result.current.recency

    act(() => result.current.touchProject('p2'))

    expect(result.current.recency).toBe(before)
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
