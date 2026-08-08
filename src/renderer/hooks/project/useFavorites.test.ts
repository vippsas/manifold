import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFavorites } from './useFavorites'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { ManifoldSettings, StoredFavorite } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const workspaces: Workspace[] = [
  { id: 'w1', name: 'ML Pipeline', projectIds: ['p1', 'p2'], createdAt: '' },
  { id: 'w2', name: 'billing fix', projectIds: ['p2'], createdAt: '' },
  { id: 'w3', name: 'api-gateway', projectIds: ['p1'], createdAt: '' },
]

function makeSettings(favorites: StoredFavorite[]): ManifoldSettings {
  return { ...DEFAULT_SETTINGS, favorites }
}

describe('useFavorites', () => {
  it('resolves ids to ordered display entries with names, dropping unknown ids', () => {
    const settings = makeSettings(['w1', 'w2', 'gone'])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), workspaces))
    expect(result.current.favorites).toEqual([
      { id: 'w1', name: 'ML Pipeline', worktree: false },
      { id: 'w2', name: 'billing fix', worktree: false },
    ])
  })

  // The row draws a branch for a worktree workspace and a folder for a home one,
  // so the resolved entry has to carry which it is.
  it('marks a favorite that owns its own checkout as a worktree', () => {
    const withWorktree: Workspace[] = [
      { id: 'w1', name: 'ML Pipeline', projectIds: ['p1'], createdAt: '', worktreePaths: { p1: '/wt/ml' } },
      ...workspaces.slice(1),
    ]
    const { result } = renderHook(() => useFavorites(makeSettings(['w1', 'w2']), vi.fn(), withWorktree))
    expect(result.current.favorites).toEqual([
      { id: 'w1', name: 'ML Pipeline', worktree: true },
      { id: 'w2', name: 'billing fix', worktree: false },
    ])
  })

  it('resolves favorites saved by the pre-workspaces build', () => {
    // What an upgrading user actually has on disk: repo refs, from when a
    // repository was its own sidebar root.
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }, { kind: 'workspace', id: 'w2' }])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), workspaces))
    expect(result.current.favorites).toEqual([
      { id: 'w1', name: 'ML Pipeline', worktree: false },
      { id: 'w2', name: 'billing fix', worktree: false },
    ])
  })

  it('rewrites legacy refs into the current shape on the next change', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    act(() => { result.current.toggleFavorite('w2') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: ['w1', 'w2'] })
  })

  it('isFavorite reflects the raw ids', () => {
    const settings = makeSettings(['w1'])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), workspaces))
    expect(result.current.isFavorite('w1')).toBe(true)
    expect(result.current.isFavorite('w2')).toBe(false)
  })

  it('toggleFavorite appends when absent and persists a pruned list', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings(['gone'])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    act(() => { result.current.toggleFavorite('w1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: ['w1'] })
  })

  it('toggleFavorite removes when already present', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings(['w1', 'w2'])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    act(() => { result.current.toggleFavorite('w1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: ['w2'] })
  })

  it('reorderFavorites moves an entry and persists the new order', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings(['w1', 'w2', 'w3'])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    act(() => { result.current.reorderFavorites(2, 0) })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: ['w3', 'w1', 'w2'] })
  })

  it('reorderFavorites drops stale ids on persist (operates on visible order)', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings(['gone', 'w1', 'w2'])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    // Visible order is [w1, w2] (gone is filtered out); swap them.
    act(() => { result.current.reorderFavorites(1, 0) })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: ['w2', 'w1'] })
  })

  it('reorderFavorites is a no-op when indices are out of bounds', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings(['w1', 'w2'])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, workspaces))
    act(() => { result.current.reorderFavorites(5, 0) })
    act(() => { result.current.reorderFavorites(0, -1) })
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
