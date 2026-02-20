import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())
const mockSend = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
    send: mockSend,
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

  it('fetches settings on mount and migrates legacy theme', async () => {
    // Stored as 'light' (legacy) — should be migrated to 'vs'
    const customSettings = { ...DEFAULT_SETTINGS, theme: 'light' }
    mockInvoke.mockResolvedValue(customSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockInvoke).toHaveBeenCalledWith('settings:get')
    expect(result.current.settings.theme).toBe('vs')
  })

  it('preserves non-legacy theme IDs on fetch', async () => {
    const customSettings = { ...DEFAULT_SETTINGS, theme: 'dracula' }
    mockInvoke.mockResolvedValue(customSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.settings.theme).toBe('dracula')
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
      const updatedSettings = { ...DEFAULT_SETTINGS, theme: 'nord' }
      mockInvoke
        .mockResolvedValueOnce(DEFAULT_SETTINGS) // initial fetch
        .mockResolvedValueOnce(updatedSettings) // update

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({ theme: 'nord' })
      })

      expect(mockInvoke).toHaveBeenCalledWith('settings:update', { theme: 'nord' })
      expect(result.current.settings.theme).toBe('nord')
    })

    it('sends theme:changed IPC with type and background', async () => {
      mockInvoke
        .mockResolvedValueOnce(DEFAULT_SETTINGS)
        .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, theme: 'vs' })

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({ theme: 'vs' })
      })

      expect(mockSend).toHaveBeenCalledWith('theme:changed', expect.objectContaining({
        type: expect.any(String),
        background: expect.any(String),
      }))
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
        await result.current.updateSettings({ theme: 'nord' })
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
