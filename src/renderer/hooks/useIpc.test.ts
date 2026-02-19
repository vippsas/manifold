import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
    off: mockOff,
  }
})

afterEach(() => {
  // Don't delete electronAPI here — React may still need it during unmount cleanup.
  // It gets reset in beforeEach anyway.
})

import { useIpcInvoke, useIpcListener } from './useIpc'

describe('useIpcInvoke', () => {
  it('initializes with null data, not loading, no error', () => {
    const { result } = renderHook(() => useIpcInvoke<string>('test:channel'))

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('invokes the IPC channel and sets data', async () => {
    mockInvoke.mockResolvedValue('response-data')

    const { result } = renderHook(() => useIpcInvoke<string>('test:channel'))

    let invokeResult: string | null = null
    await act(async () => {
      invokeResult = await result.current.invoke('arg1', 'arg2')
    })

    expect(mockInvoke).toHaveBeenCalledWith('test:channel', 'arg1', 'arg2')
    expect(invokeResult).toBe('response-data')
    expect(result.current.data).toBe('response-data')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error when invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'))

    const { result } = renderHook(() => useIpcInvoke<string>('test:channel'))

    let invokeResult: string | null = null
    await act(async () => {
      invokeResult = await result.current.invoke()
    })

    expect(invokeResult).toBeNull()
    expect(result.current.error).toBe('IPC error')
    expect(result.current.loading).toBe(false)
  })

  it('sets error from non-Error thrown values', async () => {
    mockInvoke.mockRejectedValue('string error')

    const { result } = renderHook(() => useIpcInvoke<string>('test:channel'))

    await act(async () => {
      await result.current.invoke()
    })

    expect(result.current.error).toBe('string error')
  })

  it('clears previous error on new invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('fail'))
    mockInvoke.mockResolvedValueOnce('success')

    const { result } = renderHook(() => useIpcInvoke<string>('test:channel'))

    await act(async () => {
      await result.current.invoke()
    })
    expect(result.current.error).toBe('fail')

    await act(async () => {
      await result.current.invoke()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe('success')
  })
})

describe('useIpcListener', () => {
  it('registers a listener on mount and unregisters on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useIpcListener('test:event', handler))

    expect(mockOn).toHaveBeenCalledWith('test:event', expect.any(Function))

    unmount()

    expect(mockOff).toHaveBeenCalledWith('test:event', expect.any(Function))
  })

  it('calls the handler when event fires', () => {
    const handler = vi.fn()
    renderHook(() => useIpcListener('test:event', handler))

    // Get the callback registered with `on`
    const registeredCallback = mockOn.mock.calls[0][1]
    registeredCallback('payload-data')

    expect(handler).toHaveBeenCalledWith('payload-data')
  })

  it('uses the latest handler reference', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const { rerender } = renderHook(
      ({ handler }) => useIpcListener('test:event', handler),
      { initialProps: { handler: handler1 } },
    )

    rerender({ handler: handler2 })

    // Fire the event
    const registeredCallback = mockOn.mock.calls[0][1]
    registeredCallback('data')

    // Should call handler2, not handler1
    expect(handler2).toHaveBeenCalledWith('data')
    expect(handler1).not.toHaveBeenCalled()
  })

  it('re-registers listener when channel changes', () => {
    const handler = vi.fn()

    const { rerender } = renderHook(
      ({ channel }) => useIpcListener(channel, handler),
      { initialProps: { channel: 'channel-a' } },
    )

    expect(mockOn).toHaveBeenCalledWith('channel-a', expect.any(Function))

    rerender({ channel: 'channel-b' })

    expect(mockOff).toHaveBeenCalledWith('channel-a', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('channel-b', expect.any(Function))
  })
})
