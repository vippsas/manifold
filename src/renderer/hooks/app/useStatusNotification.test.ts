import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStatusNotification } from './useStatusNotification'

describe('useStatusNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not beep while dot is blinking', () => {
    const outputting = new Set(['s1'])
    const { rerender } = renderHook(
      ({ ids, enabled }) => useStatusNotification(ids, enabled),
      { initialProps: { ids: outputting, enabled: true } }
    )
    rerender({ ids: new Set(['s1']), enabled: true })
    vi.advanceTimersByTime(11000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('beeps after 10s when dot stops blinking', () => {
    const { rerender } = renderHook(
      ({ ids, enabled }) => useStatusNotification(ids, enabled),
      { initialProps: { ids: new Set(['s1']), enabled: true } }
    )
    rerender({ ids: new Set<string>(), enabled: true })
    vi.advanceTimersByTime(10000)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:beep')
  })

  it('cancels beep if dot resumes blinking within window', () => {
    const { rerender } = renderHook(
      ({ ids, enabled }) => useStatusNotification(ids, enabled),
      { initialProps: { ids: new Set(['s1']), enabled: true } }
    )
    rerender({ ids: new Set<string>(), enabled: true })
    vi.advanceTimersByTime(1000)
    rerender({ ids: new Set(['s1']), enabled: true })
    vi.advanceTimersByTime(10000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('does not beep when disabled', () => {
    const { rerender } = renderHook(
      ({ ids, enabled }) => useStatusNotification(ids, enabled),
      { initialProps: { ids: new Set(['s1']), enabled: false } }
    )
    rerender({ ids: new Set<string>(), enabled: false })
    vi.advanceTimersByTime(11000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('tracks multiple sessions independently', () => {
    const { rerender } = renderHook(
      ({ ids, enabled }) => useStatusNotification(ids, enabled),
      { initialProps: { ids: new Set(['s1', 's2']), enabled: true } }
    )
    // Only s1 stops outputting
    rerender({ ids: new Set(['s2']), enabled: true })
    vi.advanceTimersByTime(10000)
    expect(window.electronAPI.invoke).toHaveBeenCalledTimes(1)
  })
})
