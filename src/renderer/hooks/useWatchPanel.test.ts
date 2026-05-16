import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWatchPanel } from './useWatchPanel'
import { __watchPanelStoreTestHooks } from './watchPanelStore'

const invoke = vi.fn()
const onListener = vi.fn(() => () => undefined)

beforeEach(() => {
  invoke.mockReset()
  onListener.mockClear()
  __watchPanelStoreTestHooks.reset()
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
      return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
    }
    return undefined
  })
  ;(window as unknown as {
    electronAPI: { invoke: typeof invoke; on: typeof onListener }
  }).electronAPI = { invoke, on: onListener } as never
})

describe('useWatchPanel', () => {
  it('refreshSetupStatus stores response', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:setup-status') {
        return { ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'openai', hasApiKey: true }
      }
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.refreshSetupStatus() })
    expect(result.current.setupStatus?.ffmpeg).toBe(true)
    expect(result.current.setupStatus?.provider).toBe('openai')
    expect(result.current.setupStatus?.hasApiKey).toBe(true)
  })

  it('peekUrl invokes watch:peek', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:peek') return { ok: true, title: 'Hello', durationSeconds: 42 }
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    const peek = await result.current.peekUrl('https://youtu.be/abc')
    expect(invoke).toHaveBeenCalledWith('watch:peek', 'https://youtu.be/abc')
    expect(peek.ok).toBe(true)
    expect(peek.title).toBe('Hello')
  })

  it('peekPlaylist invokes watch:peek-playlist', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:peek-playlist') return { ok: true, entries: [{ url: 'https://a' }] }
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    const r = await result.current.peekPlaylist('https://youtube.com/playlist?list=x')
    expect(invoke).toHaveBeenCalledWith('watch:peek-playlist', 'https://youtube.com/playlist?list=x')
    expect(r.ok).toBe(true)
  })

  it('runPlaylist invokes watch:run-playlist with session id and entries', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:run-playlist') return { ok: true, spawnedSessionIds: ['sib-1'] }
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    const r = await result.current.runPlaylist([{ url: 'https://a', question: 'why?' }])
    expect(invoke).toHaveBeenCalledWith(
      'watch:run-playlist',
      's1',
      [{ url: 'https://a', question: 'why?' }],
      '',
    )
    expect(r.ok).toBe(true)
  })

  it('runPlaylist rejects when there is no active session', async () => {
    const { result } = renderHook(() => useWatchPanel(null))
    await expect(result.current.runPlaylist([{ url: 'https://a' }])).rejects.toThrow(/active session/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('runPlaylist rejects when entries is empty', async () => {
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.runPlaylist([])).rejects.toThrow(/No entries/)
    expect(invoke).not.toHaveBeenCalledWith('watch:run-playlist', expect.anything(), expect.anything(), expect.anything())
  })

  it('improveQuestion invokes git:ai-generate with the user prompt embedded', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'git:ai-generate') return 'Improved prompt text.'
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    let improved = ''
    await act(async () => { improved = await result.current.improveQuestion('  do the thing  ') })
    expect(improved).toBe('Improved prompt text.')
    const gitCall = invoke.mock.calls.find(([name]) => name === 'git:ai-generate')
    expect(gitCall).toBeDefined()
    const [channel, sid, prompt] = gitCall as [string, string, string]
    expect(channel).toBe('git:ai-generate')
    expect(sid).toBe('s1')
    expect(prompt).toContain('do the thing')
    expect(prompt).toContain('Return ONLY the improved prompt')
  })

  it('improveQuestion rejects when no active session', async () => {
    const { result } = renderHook(() => useWatchPanel(null))
    await expect(result.current.improveQuestion('hi')).rejects.toThrow(/active session/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('improveQuestion rejects when the question is blank', async () => {
    const { result } = renderHook(() => useWatchPanel('s1'))
    await expect(result.current.improveQuestion('   ')).rejects.toThrow(/empty/)
    expect(invoke).not.toHaveBeenCalledWith('git:ai-generate', expect.anything(), expect.anything())
  })

  it('improveQuestion falls back to the original when the agent returns empty', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'git:ai-generate') return '   '
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    let improved = ''
    await act(async () => { improved = await result.current.improveQuestion('keep me') })
    expect(improved).toBe('keep me')
  })

  it('readFrame invokes watch:read-frame with the path', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:read-frame') return 'data:image/jpeg;base64,abc'
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    const url = await result.current.readFrame('/tmp/manifold-watch-x/frames/frame_0001.jpg')
    expect(invoke).toHaveBeenCalledWith('watch:read-frame', '/tmp/manifold-watch-x/frames/frame_0001.jpg')
    expect(url).toBe('data:image/jpeg;base64,abc')
  })

  it('installBinaries refreshes status afterwards', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:install-binaries') {
        return { installed: ['ffmpeg'], alreadyPresent: ['yt-dlp'], errors: [] }
      }
      if (channel === 'watch:setup-status') {
        return { ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'none', hasApiKey: false }
      }
      if (channel === 'watch:state-get' || channel === 'watch:state-set-url') {
        return { url: '', playlistFrames: {}, siblingByIndex: {}, playlistDispatched: false }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await act(async () => { await result.current.installBinaries() })
    expect(invoke).toHaveBeenCalledWith('watch:install-binaries')
    expect(invoke).toHaveBeenCalledWith('watch:setup-status')
  })

  it('persists url through the store across remounts', async () => {
    const first = renderHook(() => useWatchPanel('s1'))
    act(() => { first.result.current.setUrl('https://youtu.be/abc') })
    expect(first.result.current.url).toBe('https://youtu.be/abc')
    first.unmount()

    const remounted = renderHook(() => useWatchPanel('s1'))
    expect(remounted.result.current.url).toBe('https://youtu.be/abc')
  })

  it('hydrates persisted watch run state from the main process', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'watch:state-get') {
        return {
          url: 'https://playlist',
          playlistFrames: { 1: [{ path: '/tmp/manifold-watch-x/frame.jpg', timestampSeconds: 12 }] },
          siblingByIndex: { 1: 'sib-1' },
          playlistDispatched: true,
        }
      }
      return undefined
    })
    const { result } = renderHook(() => useWatchPanel('s1'))
    await waitFor(() => expect(result.current.url).toBe('https://playlist'))
    expect(result.current.siblingByIndex).toEqual({ 1: 'sib-1' })
    expect(result.current.playlistFrames[1][0].timestampSeconds).toBe(12)
    expect(result.current.playlistDispatched).toBe(true)
  })

  it('setUrl resets post-run state when changing URLs', async () => {
    const { result } = renderHook(() => useWatchPanel('s1'))
    act(() => {
      result.current.setUrl('https://youtu.be/old')
      result.current.setSiblingByIndex({ 0: 'sib-x' })
      result.current.setPlaylistDispatched(true)
    })
    expect(result.current.siblingByIndex).toEqual({ 0: 'sib-x' })
    act(() => { result.current.setUrl('https://youtu.be/new') })
    expect(result.current.siblingByIndex).toEqual({})
    expect(result.current.playlistDispatched).toBe(false)
  })
})
