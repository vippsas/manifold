import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGitOperations } from './useGitOperations'
import { SessionReadinessApi } from './session-readiness.test-helpers'

let api: SessionReadinessApi
beforeEach(() => {
  api = new SessionReadinessApi()
  api.install()
})
afterEach(cleanup)

describe('useGitOperations session discovery', () => {
  it('retries ahead/behind when its restored session becomes registered', async () => {
    const { result } = renderHook(() => useGitOperations('restored'))
    await act(async () => {})
    expect(result.current.aheadBehind).toEqual({ ahead: 0, behind: 0 })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    act(() => { api.discover('other') })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 }))
    expect(api.invoke).toHaveBeenCalledTimes(2)
  })

  it('keeps the discovered counts when an earlier empty read arrives late', async () => {
    let resolveMiss!: (value: { ahead: number; behind: number }) => void
    api.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveMiss = resolve }))
    const { result } = renderHook(() => useGitOperations('restored'))

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 }))
    await act(async () => { resolveMiss({ ahead: 0, behind: 0 }) })
    expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 })
  })
})
