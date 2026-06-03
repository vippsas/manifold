import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFavorites } from './useFavorites'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type { ManifoldSettings, Project, FavoriteRef } from '../../shared/types'
import type { Workspace } from '../../shared/workspace-types'

const projects: Project[] = [
  { id: 'p1', name: 'api-gateway', path: '/a', baseBranch: 'main', addedAt: '' },
  { id: 'p2', name: 'billing', path: '/b', baseBranch: 'main', addedAt: '' },
]
const workspaces: Workspace[] = [
  { id: 'w1', name: 'ML Pipeline', projectIds: ['p1', 'p2'], createdAt: '' },
]

function makeSettings(favorites: FavoriteRef[]): ManifoldSettings {
  return { ...DEFAULT_SETTINGS, favorites }
}

describe('useFavorites', () => {
  it('resolves refs to ordered display entries with names, dropping unknown refs', () => {
    const settings = makeSettings([
      { kind: 'workspace', id: 'w1' },
      { kind: 'repo', id: 'p2' },
      { kind: 'repo', id: 'gone' },
    ])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), projects, workspaces))
    expect(result.current.favorites).toEqual([
      { kind: 'workspace', id: 'w1', name: 'ML Pipeline' },
      { kind: 'repo', id: 'p2', name: 'billing' },
    ])
  })

  it('isFavorite reflects the raw refs', () => {
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), projects, workspaces))
    expect(result.current.isFavorite('repo', 'p1')).toBe(true)
    expect(result.current.isFavorite('repo', 'p2')).toBe(false)
    expect(result.current.isFavorite('workspace', 'p1')).toBe(false)
  })

  it('toggleFavorite appends when absent and persists a pruned list', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([{ kind: 'repo', id: 'gone' }])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.toggleFavorite('repo', 'p1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: [{ kind: 'repo', id: 'p1' }] })
  })

  it('toggleFavorite removes when already present', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }, { kind: 'repo', id: 'p2' }])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.toggleFavorite('repo', 'p1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: [{ kind: 'repo', id: 'p2' }] })
  })

  it('reorderFavorites moves an entry and persists the new order', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([
      { kind: 'repo', id: 'p1' },
      { kind: 'repo', id: 'p2' },
      { kind: 'workspace', id: 'w1' },
    ])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.reorderFavorites(2, 0) })
    expect(updateSettings).toHaveBeenCalledWith({
      favorites: [
        { kind: 'workspace', id: 'w1' },
        { kind: 'repo', id: 'p1' },
        { kind: 'repo', id: 'p2' },
      ],
    })
  })
})
