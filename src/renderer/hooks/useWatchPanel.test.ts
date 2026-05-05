import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWatchPanel } from './useWatchPanel'
import { __watchPanelStoreTestHooks } from './watchPanelStore'

const invoke = vi.fn()
const onListener = vi.fn(() => () => undefined)

beforeEach(() => {
  invoke.mockReset()
  onListener.mockClear()
  __watchPanelStoreTestHooks.reset()
  ;(window as unknown as {
    electronAPI: { invoke: typeof invoke; on: typeof onListener }
  }).electronAPI = { invoke, on: onListener } as never
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

  it('runWatch rejects when source is empty', async () => {
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.runWatch('   ')).rejects.toThrow(/Source is required/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('runWatch surfaces error when invoke returns ok:false', async () => {
    invoke.mockResolvedValueOnce({ ok: false, error: 'PTY closed' })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.runWatch('https://x')).rejects.toThrow('PTY closed')
  })

  it('refreshSetupStatus stores response', async () => {
    invoke.mockResolvedValueOnce({
      ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'openai', hasApiKey: true,
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.refreshSetupStatus() })
    expect(result.current.setupStatus?.ffmpeg).toBe(true)
    expect(result.current.setupStatus?.provider).toBe('openai')
    expect(result.current.setupStatus?.hasApiKey).toBe(true)
  })

  it('runWatch surfaces frames to the hook state', async () => {
    invoke.mockResolvedValueOnce({
      ok: true,
      frames: [
        { path: '/tmp/manifold-watch-x/frames/frame_0001.jpg', timestampSeconds: 0 },
        { path: '/tmp/manifold-watch-x/frames/frame_0002.jpg', timestampSeconds: 7 },
      ],
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.runWatch('https://x') })
    expect(result.current.frames).toHaveLength(2)
    expect(result.current.frames[1].timestampSeconds).toBe(7)
  })

  it('frames persist across remounts for the same session', async () => {
    invoke.mockResolvedValueOnce({
      ok: true,
      frames: [{ path: '/tmp/x/f1.jpg', timestampSeconds: 0 }],
    })
    const first = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await first.result.current.runWatch('https://x') })
    expect(first.result.current.frames).toHaveLength(1)
    first.unmount()

    const remounted = renderHook(() => useWatchPanel('s1'))
    expect(remounted.result.current.frames).toHaveLength(1)
    expect(remounted.result.current.frames[0].path).toBe('/tmp/x/f1.jpg')
  })

  it('frames are scoped per session', async () => {
    invoke.mockResolvedValueOnce({
      ok: true,
      frames: [{ path: '/tmp/a/f.jpg', timestampSeconds: 0 }],
    })
    const a = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await a.result.current.runWatch('https://a') })
    a.unmount()

    const b = renderHook(() => useWatchPanel('s2'))
    expect(b.result.current.frames).toHaveLength(0)
  })

  it('readFrame invokes watch:read-frame with the path', async () => {
    invoke.mockResolvedValueOnce('data:image/jpeg;base64,abc')
    const { result } = renderHook(() => useWatchPanel('s1'))
    const url = await result.current.readFrame('/tmp/manifold-watch-x/frames/frame_0001.jpg')
    expect(invoke).toHaveBeenCalledWith('watch:read-frame', '/tmp/manifold-watch-x/frames/frame_0001.jpg')
    expect(url).toBe('data:image/jpeg;base64,abc')
  })

  it('installBinaries refreshes status afterwards', async () => {
    invoke
      .mockResolvedValueOnce({ installed: ['ffmpeg'], alreadyPresent: ['yt-dlp'], errors: [] })
      .mockResolvedValueOnce({ ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'none', hasApiKey: false })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.installBinaries() })
    expect(invoke).toHaveBeenNthCalledWith(1, 'watch:install-binaries')
    expect(invoke).toHaveBeenNthCalledWith(2, 'watch:setup-status')
  })
})
