import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { useSearch } from './useSearch'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearch', () => {
  it('ignores stale search responses after the request is cleared', async () => {
    const deferred = createDeferred<{
      results: Array<{ id: string; source: 'code'; title: string; snippet: string; filePath: string; rootPath: string; relativePath: string; line: number }>
      total: number
      tookMs: number
    }>()

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({
          projectId: 'project-1',
          activeSessionId: 'session-1',
          sessions: [],
        })
      }
      if (channel === 'search:query') {
        return deferred.promise
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    const { result } = renderHook(() => useSearch('project-1', 'session-1'))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockInvoke).toHaveBeenCalledWith('search:context', 'project-1', 'session-1')

    act(() => {
      result.current.setQuery('auth')
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isSearching).toBe(true)

    act(() => {
      result.current.setQuery('')
    })

    await act(async () => {
      deferred.resolve({
        results: [{
          id: 'code-1',
          source: 'code',
          title: 'auth.ts',
          snippet: 'validateToken(token)',
          filePath: '/repo/src/auth.ts',
          rootPath: '/repo',
          relativePath: 'src/auth.ts',
          line: 42,
        }],
        total: 1,
        tookMs: 12,
      })
      await Promise.resolve()
    })

    expect(result.current.query).toBe('')
    expect(result.current.results).toEqual([])
    expect(result.current.warnings).toEqual([])
    expect(result.current.isSearching).toBe(false)
  })

  it('sends workspace session ids and project ids when All Agents scope is selected', async () => {
    mockInvoke.mockImplementation((channel: string, payload?: unknown) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({
          projectId: 'project-1',
          activeSessionId: 'session-1',
          sessions: [{
            sessionId: 'session-1',
            branchName: 'feature/search',
            runtimeId: 'codex',
            worktreePath: '/repo/.manifold/worktrees/feature-search',
            additionalDirs: [],
            status: 'running',
          }],
        })
      }
      if (channel === 'search:query') {
        return Promise.resolve({
          results: [],
          total: 0,
          tookMs: 4,
        })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel} ${JSON.stringify(payload)}`))
    })

    const { result } = renderHook(() => useSearch('project-1', 'session-1', {
      'project-1': [{
        id: 'session-1',
        projectId: 'project-1',
        runtimeId: 'codex',
        branchName: 'feature/search',
        worktreePath: '/repo/.manifold/worktrees/feature-search',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      }],
      'project-2': [{
        id: 'session-2',
        projectId: 'project-2',
        runtimeId: 'claude',
        branchName: 'larvik',
        worktreePath: '/trancefjord/.manifold/worktrees/larvik',
        status: 'waiting',
        pid: 2,
        additionalDirs: ['/trancefjord/docs'],
      }],
    }))

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setMode('everything')
      result.current.setScopeKind('all-project-sessions')
      result.current.setQuery('trancefjord')
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockInvoke).toHaveBeenCalledWith('search:query', expect.objectContaining({
      projectId: 'project-1',
      scope: expect.objectContaining({
        kind: 'all-project-sessions',
        includeAdditionalDirs: true,
        sessionIds: ['session-1', 'session-2'],
        projectIds: ['project-1', 'project-2'],
      }),
    }))
  })

  it('does not rerun an active-session search when workspace sessions are recreated', async () => {
    mockInvoke.mockImplementation((channel: string, projectId?: unknown, activeSessionId?: unknown) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({
          projectId,
          activeSessionId,
          sessions: [{
            sessionId: 'session-1',
            branchName: 'feature/search',
            runtimeId: 'codex',
            worktreePath: '/repo/.manifold/worktrees/feature-search',
            additionalDirs: [],
            status: 'running',
          }],
        })
      }
      if (channel === 'search:query') {
        return Promise.resolve({
          results: [],
          total: 0,
          tookMs: 4,
        })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    const { result, rerender } = renderHook(
      ({ sessions }) => useSearch('project-1', 'session-1', sessions),
      {
        initialProps: {
          sessions: {
            'project-1': [{
              id: 'session-1',
              projectId: 'project-1',
              runtimeId: 'codex',
              branchName: 'feature/search',
              worktreePath: '/repo/.manifold/worktrees/feature-search',
              status: 'running',
              pid: 1,
              additionalDirs: [],
            }],
          },
        },
      },
    )

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setQuery('auth')
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(getSearchQueryCalls()).toHaveLength(1)

    rerender({
      sessions: {
        'project-1': [{
          id: 'session-1',
          projectId: 'project-1',
          runtimeId: 'codex',
          branchName: 'feature/search',
          worktreePath: '/repo/.manifold/worktrees/feature-search',
          status: 'running',
          pid: 1,
          additionalDirs: [],
        }],
      },
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(getSearchQueryCalls()).toHaveLength(1)
  })

  it('does not rerun an all-project-sessions search when the active session changes', async () => {
    const sessions = {
      'project-1': [{
        id: 'session-1',
        projectId: 'project-1',
        runtimeId: 'codex',
        branchName: 'feature/search',
        worktreePath: '/repo/.manifold/worktrees/feature-search',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      }],
      'project-2': [{
        id: 'session-2',
        projectId: 'project-2',
        runtimeId: 'claude',
        branchName: 'larvik',
        worktreePath: '/trancefjord/.manifold/worktrees/larvik',
        status: 'waiting',
        pid: 2,
        additionalDirs: ['/trancefjord/docs'],
      }],
    }

    mockInvoke.mockImplementation((channel: string, projectId?: unknown, activeSessionId?: unknown) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({
          projectId,
          activeSessionId,
          sessions: [
            {
              sessionId: 'session-1',
              branchName: 'feature/search',
              runtimeId: 'codex',
              worktreePath: '/repo/.manifold/worktrees/feature-search',
              additionalDirs: [],
              status: 'running',
            },
            {
              sessionId: 'session-2',
              branchName: 'larvik',
              runtimeId: 'claude',
              worktreePath: '/trancefjord/.manifold/worktrees/larvik',
              additionalDirs: ['/trancefjord/docs'],
              status: 'waiting',
            },
          ],
        })
      }
      if (channel === 'search:query') {
        return Promise.resolve({
          results: [],
          total: 0,
          tookMs: 4,
        })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    const { result, rerender } = renderHook(
      ({ activeSessionId }) => useSearch('project-1', activeSessionId, sessions),
      {
        initialProps: { activeSessionId: 'session-1' },
      },
    )

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setMode('everything')
      result.current.setScopeKind('all-project-sessions')
      result.current.setQuery('trancefjord')
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(getSearchQueryCalls()).toHaveLength(1)

    rerender({ activeSessionId: 'session-2' })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(getSearchQueryCalls()).toHaveLength(1)
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function getSearchQueryCalls() {
  return mockInvoke.mock.calls.filter(([channel]) => channel === 'search:query')
}
