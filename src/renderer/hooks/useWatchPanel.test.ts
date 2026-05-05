import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWatchPanel } from './useWatchPanel'

const invoke = vi.fn()
beforeEach(() => {
  invoke.mockReset()
  ;(window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke } as never
})

describe('useWatchPanel', () => {
  it('runWatch invokes watch:run with active session id', async () => {
    invoke.mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.runWatch('https://x', 'why?') })
    expect(invoke).toHaveBeenCalledWith('watch:run', 's1', 'https://x', 'why?')
  })

  it('runWatch rejects when no active session', async () => {
    const { result } = renderHook(() => useWatchPanel(null))
    await expect(result.current.runWatch('https://x')).rejects.toThrow(/active session/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('runWatch rejects when URL is empty', async () => {
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.runWatch('   ')).rejects.toThrow(/URL is required/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('runWatch surfaces error when invoke returns ok:false', async () => {
    invoke.mockResolvedValueOnce({ ok: false, error: 'PTY closed' })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.runWatch('https://x')).rejects.toThrow('PTY closed')
  })

  it('refreshSetupStatus stores response', async () => {
    invoke.mockResolvedValueOnce({ ffmpeg: true, ytdlp: true, claudeCli: true, apiKeyKind: 'openai' })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.refreshSetupStatus() })
    expect(result.current.setupStatus?.ffmpeg).toBe(true)
    expect(result.current.setupStatus?.apiKeyKind).toBe('openai')
  })
})
