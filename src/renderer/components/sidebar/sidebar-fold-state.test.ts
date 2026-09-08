import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspaceFolds, workspaceFoldKey, repoFoldKey, __resetFoldStateForTests } from './sidebar-fold-state'

function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  } as Storage)
  return store
}

let store: Map<string, string>
beforeEach(() => {
  __resetFoldStateForTests()
  store = installLocalStorage()
})

const KEY = 'manifold.sidebar.openWorkspaces.v2'

describe('useWorkspaceFolds', () => {
  it('namespaces keys by what they fold', () => {
    expect(workspaceFoldKey('w1')).toBe('workspace:w1')
    expect(repoFoldKey('p1')).toBe('repo:p1')
  })

  it('starts closed, toggles open, and persists', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    expect(result.current.isOpen('workspace:w1')).toBe(false)
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
    expect(JSON.parse(store.get(KEY)!)).toEqual(['workspace:w1'])
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(false)
  })

  // #902: opening one card never closes another.
  it('keeps any number open at once', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => { result.current.toggle('workspace:w1'); result.current.toggle('workspace:w2') })
    expect(result.current.isOpen('workspace:w1')).toBe(true)
    expect(result.current.isOpen('workspace:w2')).toBe(true)
  })

  // Entering a workspace reveals it; it must not shut one already showing.
  it('open is idempotent', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.open('workspace:w1'))
    act(() => result.current.open('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
  })

  it('restores from storage on mount', () => {
    store.set(KEY, JSON.stringify(['repo:p9']))
    const { result } = renderHook(() => useWorkspaceFolds())
    expect(result.current.isOpen('repo:p9')).toBe(true)
  })

  it('keeps two mounted copies in step', () => {
    const a = renderHook(() => useWorkspaceFolds())
    const b = renderHook(() => useWorkspaceFolds())
    act(() => a.result.current.toggle('workspace:w1'))
    expect(b.result.current.isOpen('workspace:w1')).toBe(true)
  })

  it('keeps toggling in memory when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    } as unknown as Storage)
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
  })

  // Repo groups default to open: the store only records the ones you closed,
  // the inverse of how it records the cards you opened.
  it('treats an untouched group key as open', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    expect(result.current.isGroupOpen('repo:p1')).toBe(true)
  })

  it('toggle closes an open group', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.toggle('repo:p1'))
    expect(result.current.isGroupOpen('repo:p1')).toBe(false)
  })

  it('openGroup reopens a closed group and no-ops on an already-open one', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.toggle('repo:p1'))
    expect(result.current.isGroupOpen('repo:p1')).toBe(false)
    act(() => result.current.openGroup('repo:p1'))
    expect(result.current.isGroupOpen('repo:p1')).toBe(true)
    // No-op on an already-open group: nothing should throw, and it stays open.
    act(() => result.current.openGroup('repo:p1'))
    expect(result.current.isGroupOpen('repo:p1')).toBe(true)
  })
})
