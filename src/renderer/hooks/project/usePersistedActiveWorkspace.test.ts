import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePersistedActiveWorkspace } from './usePersistedActiveWorkspace'
import type { Workspace } from '../../../shared/workspace-types'

const mockInvoke = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  ;(window as any).electronAPI = { invoke: mockInvoke, send: vi.fn(), on: vi.fn(() => () => {}) }
})

function workspace(id: string): Workspace {
  return { id, name: id, projectIds: [], createdAt: '' } as Workspace
}

describe('usePersistedActiveWorkspace', () => {
  it('restores a persisted id that still exists', async () => {
    mockInvoke.mockResolvedValue('w1')
    const { result } = renderHook(() => usePersistedActiveWorkspace([workspace('w1')]))
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('w1'))
    expect(mockInvoke).toHaveBeenCalledWith('workspace:get-active')
  })

  it('falls back to null when the persisted workspace is gone', async () => {
    mockInvoke.mockResolvedValue('deleted')
    const { result } = renderHook(() => usePersistedActiveWorkspace([workspace('w1')]))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('workspace:get-active'))
    expect(result.current.activeWorkspaceId).toBeNull()
  })

  it('does not write during the initial load', async () => {
    mockInvoke.mockResolvedValue('w1')
    const { rerender } = renderHook(
      ({ list }) => usePersistedActiveWorkspace(list),
      { initialProps: { list: [] as Workspace[] } },
    )
    rerender({ list: [workspace('w1')] })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('workspace:get-active'))
    expect(mockInvoke).not.toHaveBeenCalledWith('workspace:set-active', null)
  })

  it('writes through on every change', async () => {
    mockInvoke.mockResolvedValue(null)
    const { result } = renderHook(() => usePersistedActiveWorkspace([workspace('w1'), workspace('w2')]))
    act(() => { result.current.setActiveWorkspaceId('w2') })
    expect(result.current.activeWorkspaceId).toBe('w2')
    expect(mockInvoke).toHaveBeenCalledWith('workspace:set-active', 'w2')

    act(() => { result.current.setActiveWorkspaceId(null) })
    expect(result.current.activeWorkspaceId).toBeNull()
    expect(mockInvoke).toHaveBeenCalledWith('workspace:set-active', null)
  })
})
