import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFetchProject } from './useFetchProject'

const mockInvoke = vi.fn()
const fetched = { updatedBranch: 'main', previousRef: 'aaa', currentRef: 'bbb', commitCount: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(fetched)
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke } }).electronAPI = { invoke: mockInvoke }
})

describe('useFetchProject', () => {
  // `git:fetch` acts on the repo's *clone* and its base branch, never on the
  // workspace's own checkout — the row's fetch updates the branch new work is
  // cut from, which is what "behind origin" is measured against.
  it('fetches the repo through git:fetch, by project id', async () => {
    const { result } = renderHook(() => useFetchProject('p1'))

    await act(async () => { await result.current.fetchProject() })

    expect(mockInvoke).toHaveBeenCalledWith('git:fetch', 'p1')
  })

  it('exposes the result and reports the repo fresh', async () => {
    const onFetched = vi.fn()
    const { result } = renderHook(() => useFetchProject('p1', onFetched))

    await act(async () => { await result.current.fetchProject() })

    expect(result.current.result).toEqual(fetched)
    expect(onFetched).toHaveBeenCalledWith('p1')
  })

  it('is fetching while the fetch is in flight', async () => {
    let release!: (value: unknown) => void
    mockInvoke.mockReturnValue(new Promise((resolve) => { release = resolve }))
    const { result } = renderHook(() => useFetchProject('p1'))

    act(() => { void result.current.fetchProject() })
    expect(result.current.isFetching).toBe(true)

    await act(async () => { release(fetched) })
    expect(result.current.isFetching).toBe(false)
  })

  // Offline, no origin, a deleted base branch: the row has to say so rather
  // than silently stay behind.
  it('surfaces a failure and leaves the repo unmarked', async () => {
    mockInvoke.mockRejectedValue(new Error('fatal: unable to access remote'))
    const onFetched = vi.fn()
    const { result } = renderHook(() => useFetchProject('p1', onFetched))

    await act(async () => { await result.current.fetchProject() })

    expect(result.current.error).toBe('fatal: unable to access remote')
    expect(result.current.result).toBeNull()
    expect(onFetched).not.toHaveBeenCalled()
  })

  it('clears the message five seconds later', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useFetchProject('p1'))
      await act(async () => { await result.current.fetchProject() })
      expect(result.current.result).toEqual(fetched)

      act(() => { vi.advanceTimersByTime(5000) })

      expect(result.current.result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
