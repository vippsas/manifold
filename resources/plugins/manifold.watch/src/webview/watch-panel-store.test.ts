import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { watchPanelStore, __watchPanelStoreTestHooks, STORAGE_KEY } from './watch-panel-store'
import type { WatchFrameRef, WatchSessionSnapshot } from '../shared-types'

const frames = (label: string): WatchFrameRef[] => [{ path: `/tmp/${label}.png`, timestampSeconds: 0 }]

const snapshot = (overrides: Partial<WatchSessionSnapshot> = {}): WatchSessionSnapshot => ({
  url: 'https://youtu.be/abc',
  run: null,
  ...overrides,
})

beforeEach(() => {
  __watchPanelStoreTestHooks.reset()
})
afterEach(() => {
  __watchPanelStoreTestHooks.reset()
})

describe('watchPanelStore.applyRunProgress', () => {
  it('records frames and the pipeline stage', () => {
    watchPanelStore.applyRunProgress('s1', 'stage', 'transcribe')
    watchPanelStore.applyRunProgress('s1', 'frames', frames('a'))
    const state = watchPanelStore.get('s1')
    expect(state.stage).toBe('transcribe')
    expect(state.frames[0].path).toBe('/tmp/a.png')
  })

  it('ignores log kinds and malformed payloads', () => {
    watchPanelStore.applyRunProgress('s1', 'log', 'a line')
    watchPanelStore.applyRunProgress('s1', 'frames', 'not-an-array')
    watchPanelStore.applyRunProgress('s1', 'stage', 42)
    const state = watchPanelStore.get('s1')
    expect(state.frames).toEqual([])
    expect(state.stage).toBeNull()
  })

  it('keeps progress isolated per session', () => {
    watchPanelStore.applyRunProgress('s1', 'frames', frames('a'))
    expect(watchPanelStore.get('s2').frames).toEqual([])
  })
})

describe('watchPanelStore run lifecycle', () => {
  it('setRunning → applyRunResult(ok) transitions running → sent', () => {
    watchPanelStore.setUrl('s1', 'https://youtu.be/abc')
    watchPanelStore.setRunning('s1')
    expect(watchPanelStore.get('s1').status).toBe('running')
    watchPanelStore.applyRunResult('s1', { ok: true, workDir: '/tmp/wd' })
    const state = watchPanelStore.get('s1')
    expect(state.status).toBe('sent')
    expect(state.error).toBeNull()
    expect(state.stage).toBeNull()
  })

  it('applyRunResult(error) surfaces the error', () => {
    watchPanelStore.setRunning('s1')
    watchPanelStore.applyRunResult('s1', { ok: false, error: 'yt-dlp boom' })
    const state = watchPanelStore.get('s1')
    expect(state.status).toBe('error')
    expect(state.error).toBe('yt-dlp boom')
  })

  it('routes a result to its owning session even when another is active', () => {
    watchPanelStore.setRunning('s1')
    watchPanelStore.setUrl('s2', 'https://other')
    watchPanelStore.applyRunResult('s1', { ok: true })
    expect(watchPanelStore.get('s1').status).toBe('sent')
    expect(watchPanelStore.get('s2').status).toBe('idle')
  })
})

describe('watchPanelStore per-session restore', () => {
  it('keeps each session state in memory so switching back restores it', () => {
    watchPanelStore.setUrl('s1', 'https://one')
    watchPanelStore.setUrl('s2', 'https://two')
    // "Switch" to s2 and back: state is keyed by session, nothing is lost.
    expect(watchPanelStore.get('s2').url).toBe('https://two')
    expect(watchPanelStore.get('s1').url).toBe('https://one')
  })

  it('hydrateFromPersisted seeds URLs only for sessions without in-memory state', () => {
    watchPanelStore.setUrl('s1', 'https://live')
    watchPanelStore.hydrateFromPersisted({
      [STORAGE_KEY]: { s1: { url: 'https://stale' }, s2: { url: 'https://persisted' } },
    })
    expect(watchPanelStore.get('s1').url).toBe('https://live')
    expect(watchPanelStore.get('s2').url).toBe('https://persisted')
  })

  it('hydrateFromPersisted tolerates a missing or malformed blob', () => {
    watchPanelStore.hydrateFromPersisted({})
    watchPanelStore.hydrateFromPersisted({ [STORAGE_KEY]: 'garbage' })
    watchPanelStore.hydrateFromPersisted({ [STORAGE_KEY]: { s1: { url: 7 } } })
    expect(watchPanelStore.get('s1').url).toBe('')
  })
})

describe('watchPanelStore.hydrateSession', () => {
  it('restores a running state (the host run survived a webview reload)', () => {
    watchPanelStore.hydrateSession('s1', snapshot({
      run: { runId: 'r1', status: 'processing', frames: frames('a') },
    }), true, 'transcribe')
    const state = watchPanelStore.get('s1')
    expect(state.url).toBe('https://youtu.be/abc')
    expect(state.status).toBe('running')
    expect(state.stage).toBe('transcribe')
    expect(state.frames[0].path).toBe('/tmp/a.png')
  })

  it('maps a finished run to sent and a failed run to error', () => {
    watchPanelStore.hydrateSession('s1', snapshot({
      run: { runId: 'r1', status: 'ready', frames: [], workDir: '/tmp/wd' },
    }), false, null)
    expect(watchPanelStore.get('s1').status).toBe('sent')

    watchPanelStore.hydrateSession('s2', snapshot({
      run: { runId: 'r2', status: 'error', frames: [], error: 'boom' },
    }), false, null)
    const s2 = watchPanelStore.get('s2')
    expect(s2.status).toBe('error')
    expect(s2.error).toBe('boom')
  })

  it('treats a persisted processing run without a live host run as idle (host died mid-run)', () => {
    watchPanelStore.hydrateSession('s1', snapshot({
      run: { runId: 'r1', status: 'processing', frames: [] },
    }), false, null)
    expect(watchPanelStore.get('s1').status).toBe('idle')
  })

  it('drops a stale snapshot when the user already typed a different URL', () => {
    watchPanelStore.setUrl('s1', 'https://new-url')
    watchPanelStore.hydrateSession('s1', snapshot({
      url: 'https://stale-url',
      run: { runId: 'r1', status: 'ready', frames: frames('old') },
    }), false, null)
    const state = watchPanelStore.get('s1')
    expect(state.url).toBe('https://new-url')
    expect(state.status).toBe('idle')
    expect(state.frames).toEqual([])
  })
})

describe('watchPanelStore.setUrl', () => {
  it('resets post-run state when changing URLs', () => {
    watchPanelStore.setUrl('s1', 'https://youtu.be/old')
    watchPanelStore.setRunning('s1')
    watchPanelStore.applyRunProgress('s1', 'frames', frames('a'))
    watchPanelStore.applyRunResult('s1', { ok: true })
    watchPanelStore.setUrl('s1', 'https://youtu.be/new')
    const state = watchPanelStore.get('s1')
    expect(state.status).toBe('idle')
    expect(state.frames).toEqual([])
    expect(state.error).toBeNull()
  })

  it('schedules a debounced persist with the localStorage-compatible key and shape', () => {
    vi.useFakeTimers()
    try {
      const persist = vi.fn()
      __watchPanelStoreTestHooks.setPersist(persist)
      watchPanelStore.setUrl('s1', 'https://youtu.be/abc')
      expect(persist).not.toHaveBeenCalled()
      vi.advanceTimersByTime(600)
      expect(persist).toHaveBeenCalledWith(STORAGE_KEY, { s1: { url: 'https://youtu.be/abc' } })
    } finally {
      vi.useRealTimers()
    }
  })
})
