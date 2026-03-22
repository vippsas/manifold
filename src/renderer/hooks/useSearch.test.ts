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
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
