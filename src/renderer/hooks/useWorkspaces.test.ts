import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaces } from './useWorkspaces'

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

describe('useWorkspaces', () => {
  it('loads the list on mount', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 'w1', name: 'auth', projectIds: ['p1'], createdAt: '' }])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
    expect(mockInvoke).toHaveBeenCalledWith('workspace:list')
  })

  it('refreshes when list-changed fires', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toEqual([]))
    mockInvoke.mockResolvedValueOnce([{ id: 'w1', name: 'auth', projectIds: ['p1'], createdAt: '' }])
    act(() => { listeners.get('workspace:list-changed')?.() })
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
  })

  it('createWorkspace invokes the channel', async () => {
    mockInvoke.mockResolvedValueOnce([])
    mockInvoke.mockResolvedValueOnce({ id: 'w2', name: 'x', projectIds: ['p1'], createdAt: '' })
    mockInvoke.mockResolvedValueOnce([{ id: 'w2', name: 'x', projectIds: ['p1'], createdAt: '' }])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('workspace:list'))
    let created: any
    await act(async () => {
      created = await result.current.createWorkspace({ name: 'x', projectIds: ['p1'] })
    })
    expect(created.id).toBe('w2')
    expect(mockInvoke).toHaveBeenCalledWith('workspace:create', { name: 'x', projectIds: ['p1'] })
  })

  it('spawnAgent invokes the channel', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('workspace:list'))
    mockInvoke.mockResolvedValueOnce({ id: 'sess-1' })
    let session: any
    await act(async () => {
      session = await result.current.spawnAgent('w1', { runtimeId: 'claude' })
    })
    expect(session.id).toBe('sess-1')
    expect(mockInvoke).toHaveBeenCalledWith('workspace:spawn-agent', 'w1', { runtimeId: 'claude' })
  })
})
