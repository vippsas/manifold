import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearWorkspaceTreeCache, useWorkspaceTree } from './useWorkspaceTree'
import { SessionReadinessApi, restoredTree } from './session-readiness.test-helpers'

let api: SessionReadinessApi
beforeEach(() => {
  clearWorkspaceTreeCache()
  api = new SessionReadinessApi()
  api.install()
})
afterEach(cleanup)

describe('useWorkspaceTree session discovery', () => {
  it('leaves a miss uncached and expands the root when discovery retries the tree', async () => {
    const { result, unmount } = renderHook(() => useWorkspaceTree({ kind: 'session', id: 'restored' }))
    await act(async () => {})
    expect(result.current.tree).toBeNull()
    expect(result.current.expandedPaths.size).toBe(0)

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.tree).toEqual(restoredTree))
    expect(result.current.expandedPaths).toEqual(new Set([restoredTree.path]))
    expect(api.invoke).toHaveBeenCalledTimes(2)

    unmount()
    const cached = renderHook(() => useWorkspaceTree({ kind: 'session', id: 'restored' }))
    expect(cached.result.current.tree).toEqual(restoredTree)
    await act(async () => {})
  })
})
