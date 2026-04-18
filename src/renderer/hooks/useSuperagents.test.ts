import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSuperagents } from './useSuperagents'

const mockInvoke = vi.fn()
const listeners = new Map<string, (...args: any[]) => void>()
const mockOn = vi.fn((channel: string, fn: any) => {
  listeners.set(channel, fn)
  return () => listeners.delete(channel)
})

beforeEach(() => {
  listeners.clear()
  mockInvoke.mockReset()
  mockOn.mockClear()
  ;(window as any).electronAPI = { invoke: mockInvoke, send: vi.fn(), on: mockOn }
})

describe('useSuperagents', () => {
  it('fetches list on mount', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 's1', name: 'one' }])
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(result.current.superagents).toHaveLength(1))
    expect(mockInvoke).toHaveBeenCalledWith('superagent:list')
  })

  it('refreshes when list-changed fires', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(result.current.superagents).toEqual([]))
    mockInvoke.mockResolvedValueOnce([{ id: 's1' }])
    act(() => { listeners.get('superagent:list-changed')?.() })
    await waitFor(() => expect(result.current.superagents).toHaveLength(1))
  })

  it('create invokes and returns the new superagent', async () => {
    mockInvoke.mockResolvedValueOnce([])
    mockInvoke.mockResolvedValueOnce({ id: 's1', name: 'new' })
    mockInvoke.mockResolvedValueOnce([{ id: 's1', name: 'new' }])
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('superagent:list'))
    let created: any
    await act(async () => {
      created = await result.current.createSuperagent({ name: 'new', taskDescription: '', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: '' })
    })
    expect(created.id).toBe('s1')
    expect(mockInvoke).toHaveBeenCalledWith('superagent:create', expect.any(Object))
  })
})
