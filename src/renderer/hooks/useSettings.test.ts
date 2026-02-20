import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

import { useSettings } from './useSettings'

describe('useSettings', () => {
  it('initializes with default settings', () => {
    mockInvoke.mockResolvedValue(DEFAULT_SETTINGS)

    const { result } = renderHook(() => useSettings())

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
    expect(result.current.loading).toBe(true)
  })

  it('fetches settings on mount', async () => {
    const customSettings = { ...DEFAULT_SETTINGS, theme: 'light' as const }
    mockInvoke.mockResolvedValue(customSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockInvoke).toHaveBeenCalledWith('settings:get')
    expect(result.current.settings.theme).toBe('light')
  })

  it('handles fetch error', async () => {
    mockInvoke.mockRejectedValue(new Error('settings fetch failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('settings fetch failed')
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  describe('updateSettings', () => {
    it('calls IPC and updates local state', async () => {
      const updatedSettings = { ...DEFAULT_SETTINGS, theme: 'light' as const }
      mockInvoke
        .mockResolvedValueOnce(DEFAULT_SETTINGS) // initial fetch
        .mockResolvedValueOnce(updatedSettings) // update

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({ theme: 'light' })
      })

      expect(mockInvoke).toHaveBeenCalledWith('settings:update', { theme: 'light' })
      expect(result.current.settings.theme).toBe('light')
    })

    it('sets error when update fails', async () => {
      mockInvoke
        .mockResolvedValueOnce(DEFAULT_SETTINGS)
        .mockRejectedValueOnce(new Error('update failed'))

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({ theme: 'light' })
      })

      expect(result.current.error).toBe('update failed')
    })
  })

  describe('IPC listener', () => {
    it('registers a listener for settings:changed', () => {
      mockInvoke.mockResolvedValue(DEFAULT_SETTINGS)

      renderHook(() => useSettings())

      expect(mockOn).toHaveBeenCalledWith('settings:changed', expect.any(Function))
    })

    it('updates settings when settings:changed event fires', async () => {
      mockInvoke.mockResolvedValue(DEFAULT_SETTINGS)

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Simulate the settings:changed event
      const registeredCallback = mockOn.mock.calls.find(
        (call) => call[0] === 'settings:changed',
      )![1]

      act(() => {
        registeredCallback({ ...DEFAULT_SETTINGS, scrollbackLines: 9999 })
      })

      expect(result.current.settings.scrollbackLines).toBe(9999)
    })
  })
})
