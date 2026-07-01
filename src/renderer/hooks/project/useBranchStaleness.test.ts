import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBranchStaleness } from './useBranchStaleness'
import type { Project } from '../../../shared/types'

const mockInvoke = vi.fn()
const gitProject = { id: 'p1', name: 'P1', path: '/p1', baseBranch: 'main', kind: 'git' } as unknown as Project
const folderProject = { id: 'p2', name: 'P2', path: '/p2', baseBranch: 'main', kind: 'folder' } as unknown as Project

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue({ baseBranch: 'main', behindCount: 3 })
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke } }).electronAPI = { invoke: mockInvoke }
})

describe('useBranchStaleness', () => {
  it('probes the active git project on mount and exposes its behind count', async () => {
    const { result } = renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(result.current.behindCounts.p1).toBe(3))
    expect(mockInvoke).toHaveBeenCalledWith('git:staleness', 'p1')
  })

  it('does not probe a non-git active project', async () => {
    renderHook(() => useBranchStaleness('p2', [folderProject]))
    await act(async () => { await Promise.resolve() })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('throttles a repeat probe when the window refocuses within the window', async () => {
    renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    act(() => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { await Promise.resolve() })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('markFresh zeroes a project count', async () => {
    const { result } = renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(result.current.behindCounts.p1).toBe(3))
    act(() => { result.current.markFresh('p1') })
    expect(result.current.behindCounts.p1).toBe(0)
  })
})
