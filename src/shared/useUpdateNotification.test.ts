import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockInvoke = vi.fn()
const mockUnsubscribe = vi.fn()
let updaterListener: ((payload: unknown) => void) | null = null

const mockOn = vi.fn((channel: string, listener: (payload: unknown) => void) => {
  if (channel === 'updater:status') {
    updaterListener = listener
  }
  return mockUnsubscribe
})

beforeEach(() => {
  vi.clearAllMocks()
  updaterListener = null
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

afterEach(() => {
  // Keep electronAPI mounted for React cleanup callbacks.
})

import { useUpdateNotification } from './useUpdateNotification'

describe('useUpdateNotification', () => {
  it('keeps a dismissal for the same version but resets it for a newer downloaded version', () => {
    const { result } = renderHook(() => useUpdateNotification())

    expect(mockOn).toHaveBeenCalledWith('updater:status', expect.any(Function))

    act(() => {
      updaterListener?.({ status: 'downloaded', version: '1.2.3' })
    })

    expect(result.current.updateReady).toBe(true)
    expect(result.current.version).toBe('1.2.3')

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.updateReady).toBe(false)

    act(() => {
      updaterListener?.({ status: 'downloaded', version: '1.2.3' })
    })

    expect(result.current.updateReady).toBe(false)

    act(() => {
      updaterListener?.({ status: 'downloaded', version: '1.2.4' })
    })

    expect(result.current.updateReady).toBe(true)
    expect(result.current.version).toBe('1.2.4')
  })
})
