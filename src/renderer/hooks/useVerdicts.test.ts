import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke }
})

import { useVerdicts } from './useVerdicts'

describe('useVerdicts', () => {
  it('returns empty state and does not call IPC when projectId is null', () => {
    const { result } = renderHook(() => useVerdicts(null))
    expect(result.current.records).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('fetches records for a project id', async () => {
    mockInvoke.mockResolvedValue([
      {
        sessionId: 's1',
        projectId: 'p1',
        branch: 'b',
        runtime: 'claude',
        taskPrompt: { kind: 'full', text: 't' },
        outcome: 'merged',
        createdAt: '2026-05-16',
        metrics: {
          agentCommits: 0,
          humanEdits: 0,
          diffLines: { added: 0, removed: 0 },
          filesChanged: 0,
        },
      },
    ])
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.records.length).toBe(1)
    expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p1' })
  })

  it('exposes error string when IPC rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC fail'))
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.error).toBe('IPC fail'))
    expect(result.current.records).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('refresh re-invokes IPC', async () => {
    mockInvoke.mockResolvedValue([])
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    await act(async () => {
      await result.current.refresh()
    })
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('re-fetches when projectId changes', async () => {
    mockInvoke.mockResolvedValue([])
    const { rerender } = renderHook(({ id }: { id: string | null }) => useVerdicts(id), {
      initialProps: { id: 'p1' as string | null },
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p1' }))
    rerender({ id: 'p2' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p2' }))
  })
})
