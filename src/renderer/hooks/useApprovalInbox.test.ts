import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApprovalInbox } from './useApprovalInbox'

const mockInvoke = vi.fn()
const listeners = new Map<string, (...args: any[]) => void>()
const mockOn = vi.fn((ch: string, fn: any) => { listeners.set(ch, fn); return () => listeners.delete(ch) })

beforeEach(() => {
  listeners.clear()
  mockInvoke.mockReset()
  ;(window as any).electronAPI = { invoke: mockInvoke, send: vi.fn(), on: mockOn }
})

describe('useApprovalInbox', () => {
  it('loads pending approvals on mount', async () => {
    mockInvoke.mockResolvedValueOnce([{ requestId: 'r1', superagentId: 's1', toolName: 'spawn_agent', args: {}, requestedAt: 1 }])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
  })

  it('appends on approval-request for the same superagent', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toEqual([]))
    act(() => {
      listeners.get('superagent:approval-request')?.({ requestId: 'r2', superagentId: 's1', toolName: 'send_prompt', args: {}, requestedAt: 2 })
    })
    expect(result.current.pending).toHaveLength(1)
  })

  it('ignores approval-request for a different superagent', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toEqual([]))
    act(() => {
      listeners.get('superagent:approval-request')?.({ requestId: 'r3', superagentId: 'other', toolName: 'send_prompt', args: {}, requestedAt: 3 })
    })
    expect(result.current.pending).toHaveLength(0)
  })

  it('respond() invokes approval-response and removes the entry', async () => {
    mockInvoke.mockResolvedValueOnce([{ requestId: 'r1', superagentId: 's1', toolName: 'spawn_agent', args: {}, requestedAt: 1 }])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
    mockInvoke.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.respond('r1', 'approve') })
    expect(mockInvoke).toHaveBeenCalledWith('superagent:approval-response', { requestId: 'r1', decision: 'approve' })
    expect(result.current.pending).toHaveLength(0)
  })
})
