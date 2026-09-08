import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { Workspace } from '../../../shared/workspace-types'
import type { AgentSession } from '../../../shared/types'
import { useMergedWorkspaces } from './useMergedWorkspaces'

const mockInvoke = vi.fn()
beforeEach(() => {
  mockInvoke.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { invoke: mockInvoke, on: vi.fn(() => vi.fn()) }
})

const w = (id: string): Workspace => ({ id, name: id, projectIds: ['p'], createdAt: '' })
const s = (id: string): AgentSession =>
  ({ id, projectId: 'p', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status: 'done', pid: 1, additionalDirs: [] })

describe('useMergedWorkspaces', () => {
  it('asks main once on mount and exposes the ids as a set', async () => {
    mockInvoke.mockResolvedValueOnce(['w2'])
    const { result } = renderHook(() => useMergedWorkspaces([w('w1'), w('w2')], {}))
    await waitFor(() => expect(result.current.has('w2')).toBe(true))
    expect(mockInvoke).toHaveBeenCalledWith('workspace:list-merged')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  // Verdicts finalize when a session terminates, so the session set is the
  // signal that the answer may have changed.
  it('re-asks when the session set changes, not on an unrelated rerender', async () => {
    mockInvoke.mockResolvedValue([])
    const { rerender } = renderHook(
      ({ sessions }: { sessions: Record<string, AgentSession[]> }) => useMergedWorkspaces([w('w1')], sessions),
      { initialProps: { sessions: { w1: [s('a')] } } },
    )
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    rerender({ sessions: { w1: [s('a')] } })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    rerender({ sessions: { w1: [] } })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
  })

  it('leaves the set empty when main fails or answers nothing', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('no'))
    const { result } = renderHook(() => useMergedWorkspaces([w('w1')], {}))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })
})
