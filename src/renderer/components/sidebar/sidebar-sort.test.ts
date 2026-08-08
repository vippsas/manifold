import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sortWorkspaces, useSidebarSortMode } from './sidebar-sort'

function installLocalStorage(): void {
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
}

beforeEach(() => {
  installLocalStorage()
})

const projects: Project[] = [
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2024-01-02' },
]

function ws(id: string, name: string, projectId: string): Workspace {
  return { id, name, projectIds: [projectId], createdAt: '2024-01-01' }
}

const alpha = (workspaces: Workspace[], activeId: string | null = null): string[] =>
  sortWorkspaces(workspaces, 'alpha', { recency: {}, activeId, projects }).map((w) => w.id)

describe('sortWorkspaces — alphabetical', () => {
  // A row reads `kong / moss`, so A→Z reads the same way: repo first. With
  // several worktrees per repo, that keeps each repo's together.
  it('groups by repo, then orders by the workspace name', () => {
    const workspaces = [
      ws('w-moss', 'moss', 'p-kong'),
      ws('w-zed', 'zed', 'p-apex'),
      ws('w-dune', 'dune', 'p-kong'),
    ]
    expect(alpha(workspaces)).toEqual(['w-zed', 'w-dune', 'w-moss'])
  })

  // A home workspace is named after its repo and renders with no dimmed prefix,
  // so its own name is its repo group and it sorts among that repo's worktrees.
  it('sorts a home workspace among its own repo’s worktrees', () => {
    const workspaces = [
      ws('w-moss', 'moss', 'p-kong'),
      ws('w-home', 'kong', 'p-kong'),
      ws('w-dune', 'dune', 'p-kong'),
    ]
    expect(alpha(workspaces)).toEqual(['w-dune', 'w-home', 'w-moss'])
  })

  it('does not split a group on letter case', () => {
    const workspaces = [ws('w-moss', 'Moss', 'p-kong'), ws('w-dune', 'dune', 'p-kong')]
    expect(alpha(workspaces)).toEqual(['w-dune', 'w-moss'])
  })

  // The whole point of A→Z is that a name's position is predictable; a row that
  // floats to the top on entry would take that away.
  it('does not pin the active workspace', () => {
    const workspaces = [ws('w-dune', 'dune', 'p-kong'), ws('w-moss', 'moss', 'p-kong')]
    expect(alpha(workspaces, 'w-moss')).toEqual(['w-dune', 'w-moss'])
  })

  it('falls back to the stored name when the primary repo is unknown', () => {
    const workspaces = [ws('w-b', 'beta', 'p-missing'), ws('w-a', 'alpha', 'p-missing')]
    expect(alpha(workspaces)).toEqual(['w-a', 'w-b'])
  })
})

describe('sortWorkspaces — recency', () => {
  it('still pins the active workspace, then orders by last visit', () => {
    const workspaces = [
      ws('w-a', 'alpha-space', 'p-apex'),
      ws('w-b', 'beta-space', 'p-kong'),
      ws('w-c', 'gamma-space', 'p-kong'),
    ]
    const sorted = sortWorkspaces(workspaces, 'recency', {
      recency: { 'w-b': 200, 'w-c': 300 },
      activeId: 'w-a',
      projects,
    })
    expect(sorted.map((w) => w.id)).toEqual(['w-a', 'w-c', 'w-b'])
  })
})

describe('useSidebarSortMode', () => {
  it('starts in recency, so nothing moves until the button is used', () => {
    const { result } = renderHook(() => useSidebarSortMode())
    expect(result.current[0]).toBe('recency')
  })

  it('toggles and restores the mode on remount', () => {
    const first = renderHook(() => useSidebarSortMode())
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe('alpha')
    first.unmount()

    const second = renderHook(() => useSidebarSortMode())
    expect(second.result.current[0]).toBe('alpha')
  })

  it('toggles back to recency', () => {
    const { result } = renderHook(() => useSidebarSortMode())
    act(() => result.current[1]())
    act(() => result.current[1]())
    expect(result.current[0]).toBe('recency')
  })

  it('ignores a malformed stored mode', () => {
    localStorage.setItem('manifold.sidebar.sort.v1', 'sideways')
    const { result } = renderHook(() => useSidebarSortMode())
    expect(result.current[0]).toBe('recency')
  })
})
