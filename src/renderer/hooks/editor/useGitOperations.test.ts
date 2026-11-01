import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import { useGitOperations } from './useGitOperations'
import { SessionReadinessApi, restoredTree } from './session-readiness.test-helpers'

let api: SessionReadinessApi
beforeEach(() => {
  api = new SessionReadinessApi()
  api.install()
})
afterEach(cleanup)

describe('useGitOperations session discovery', () => {
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

  it.each(['before', 'during', 'after'])(
    'retries exactly once when the session is listed with a branch %s discovery', async (timing) => {
      const { result, rerender } = renderHook(
        ({ sessions }) => {
          const activeSession = sessions.find((session) => session.id === 'restored')
          return useGitOperations(activeSession?.id ?? 'restored')
        },
        { initialProps: { sessions: [] as Pick<AgentSession, 'id' | 'branchName'>[] } },
      )
      await act(async () => {})
      expect(result.current.aheadBehind).toEqual({ ahead: 0, behind: 0 })
      expect(api.invoke).toHaveBeenCalledExactlyOnceWith('git:ahead-behind', 'restored')

      const listSession = (): void => {
        rerender({ sessions: [{ id: 'restored', branchName: 'feature' }] })
      }
      if (timing === 'before') await act(async () => { listSession() })
      await act(async () => {
        api.discover('restored')
        if (timing === 'during') listSession()
      })
      if (timing === 'after') await act(async () => { listSession() })
      expect(result.current.aheadBehind).toEqual({ ahead: 2, behind: 1 })
      expect(api.invoke).toHaveBeenCalledTimes(2)
      expect(api.invoke).toHaveBeenLastCalledWith('git:ahead-behind', 'restored')
    },
  )

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
