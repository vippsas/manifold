import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { useSearch } from './useSearch'
import { installElectronApi, mockInvoke, getSearchQueryCalls } from './useSearch.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  installElectronApi()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearch — scope reruns', () => {
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
