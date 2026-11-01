import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFileWatcher } from './useFileWatcher'
import { SessionReadinessApi, restoredTree } from './session-readiness.test-helpers'

let api: SessionReadinessApi
beforeEach(() => {
  api = new SessionReadinessApi()
  api.install()
})
afterEach(cleanup)

describe('useFileWatcher session discovery', () => {
  it('keeps a miss empty without error and retries the same id when discovery signals it', async () => {
    const { result } = renderHook(() => useFileWatcher('restored'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith('files:tree', 'restored')
    expect(result.current.tree).toBeNull()
    expect(result.current.error).toBeNull()

    act(() => { api.discover('other') })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.tree).toEqual(restoredTree))
    expect(api.invoke).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it('does not let a late miss replace the successful discovery retry', async () => {
    let resolveMiss!: (tree: null) => void
    api.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveMiss = resolve }))
    const { result } = renderHook(() => useFileWatcher('restored'))

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.tree).toEqual(restoredTree))
    await act(async () => { resolveMiss(null) })
    expect(result.current.tree).toEqual(restoredTree)
    expect(result.current.error).toBeNull()
  })
})
