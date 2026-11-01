import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGitOperations } from './useGitOperations'
import { SessionReadinessApi, restoredTree } from './session-readiness.test-helpers'

let api: SessionReadinessApi
beforeEach(() => {
  api = new SessionReadinessApi()
  api.install()
})
afterEach(cleanup)

describe('useGitOperations session discovery', () => {
  it('refreshes counts when a shell checkout changes the branch of the same session', async () => {
    api.discover('restored')
    api.invoke.mockResolvedValueOnce({ ahead: 0, behind: 0 })
    const { result, rerender } = renderHook(
      ({ branchName }) => useGitOperations('restored', branchName),
      { initialProps: { branchName: 'main' } },
    )
    await act(async () => {})
    expect(result.current.aheadBehind).toEqual({ ahead: 0, behind: 0 })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      api.emit('files:tree-changed', { sessionId: 'restored', rootPath: restoredTree.path })
      rerender({ branchName: 'feature' })
    })
    expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 })
    expect(api.invoke).toHaveBeenCalledTimes(2)
  })

  it.each([{ ahead: 2, behind: 1 }, { ahead: 0, behind: 0 }])(
    'ignores file edit bursts after the registered session returns $ahead ahead and $behind behind',
    async (counts) => {
      api.discover('restored')
      api.invoke.mockResolvedValueOnce(counts)
      const { result } = renderHook(() => useGitOperations('restored'))
      await act(async () => {})
      expect(result.current.aheadBehind).toEqual(counts)
      expect(api.invoke).toHaveBeenCalledExactlyOnceWith('git:ahead-behind', 'restored')

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          api.emit('files:tree-changed', { sessionId: 'restored', rootPath: restoredTree.path })
        })
      }
      expect(api.invoke).toHaveBeenCalledTimes(1)
      expect(result.current.aheadBehind).toEqual(counts)
    },
  )

  it('retries ahead/behind when its restored session becomes registered', async () => {
    const { result } = renderHook(() => useGitOperations('restored'))
    await act(async () => {})
    expect(result.current.aheadBehind).toEqual({ ahead: 0, behind: 0 })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    act(() => { api.discover('other') })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      api.emit('files:tree-changed', { sessionId: 'restored', rootPath: restoredTree.path })
    })
    expect(api.invoke).toHaveBeenCalledTimes(1)

    act(() => { api.discover('restored') })
    await waitFor(() => expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 }))
    expect(api.invoke).toHaveBeenCalledTimes(2)

    await act(async () => {
      api.emit('files:tree-changed', { sessionId: 'restored', rootPath: restoredTree.path })
    })
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
