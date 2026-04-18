import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()
const mockUnsubscribe = vi.fn()
let updateLogListener: (() => void) | null = null

const mockOn = vi.fn((channel: string, listener: () => void) => {
  if (channel === 'show-update-log') {
    updateLogListener = listener
  }
  return mockUnsubscribe
})

beforeEach(() => {
  vi.clearAllMocks()
  updateLogListener = null
  mockInvoke.mockResolvedValue('2026-04-18T15:13:18.306Z [updater] check failed: 504')
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

afterEach(() => {
  // Keep electronAPI mounted for React cleanup callbacks.
})

import { useUpdateLog } from './useUpdateLog'

describe('useUpdateLog', () => {
  it('opens and loads the log when the menu event fires', async () => {
    const { result } = renderHook(() => useUpdateLog())

    expect(mockOn).toHaveBeenCalledWith('show-update-log', expect.any(Function))

    act(() => {
      updateLogListener?.()
    })

    expect(result.current.visible).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.log).toContain('[updater] check failed: 504')
    })

    act(() => {
      result.current.close()
    })

    expect(result.current.visible).toBe(false)
  })

  it('clears the log through IPC and refreshes the visible content', async () => {
    mockInvoke
      .mockResolvedValueOnce('2026-04-18T15:13:18.306Z [updater] check failed: 504')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('No updater log entries have been recorded yet.')

    const { result } = renderHook(() => useUpdateLog())

    act(() => {
      updateLogListener?.()
    })

    await waitFor(() => {
      expect(result.current.log).toContain('[updater] check failed: 504')
    })

    await act(async () => {
      await result.current.clear()
    })

    expect(mockInvoke).toHaveBeenCalledWith('updater:clear-log')
    expect(result.current.log).toBe('No updater log entries have been recorded yet.')
  })
})
