import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { watchPanelStore, __watchPanelStoreTestHooks, STORAGE_KEY } from './watch-panel-store'
import type { WatchFrameRef } from '../shared-types'

const frames = (label: string): WatchFrameRef[] => [{ path: `/tmp/${label}.png`, timestampSeconds: 0 }]

beforeEach(() => {
  __watchPanelStoreTestHooks.reset()
})
afterEach(() => {
  __watchPanelStoreTestHooks.reset()
})

describe('watchPanelStore.applyPlaylistProgress', () => {
  it('accumulates frames per entry index', () => {
    watchPanelStore.applyPlaylistProgress('s1', 0, 'frames', frames('a'))
    watchPanelStore.applyPlaylistProgress('s1', 2, 'frames', frames('c'))
    const state = watchPanelStore.get('s1')
    expect(state.playlistFrames[0][0].path).toBe('/tmp/a.png')
    expect(state.playlistFrames[2][0].path).toBe('/tmp/c.png')
  })

  it('records sibling session ids per entry index', () => {
    watchPanelStore.applyPlaylistProgress('s1', 0, 'sibling', 'sib-a')
    watchPanelStore.applyPlaylistProgress('s1', 1, 'sibling', 'sib-b')
    expect(watchPanelStore.get('s1').siblingByIndex).toEqual({ 0: 'sib-a', 1: 'sib-b' })
  })

  it('ignores log/stage kinds and malformed payloads', () => {
    watchPanelStore.applyPlaylistProgress('s1', 0, 'log', 'a line')
    watchPanelStore.applyPlaylistProgress('s1', 0, 'stage', 'transcribing')
    watchPanelStore.applyPlaylistProgress('s1', 0, 'frames', 'not-an-array')
    watchPanelStore.applyPlaylistProgress('s1', 0, 'sibling', 42)
    const state = watchPanelStore.get('s1')
    expect(state.playlistFrames).toEqual({})
    expect(state.siblingByIndex).toEqual({})
  })

  it('keeps progress isolated per session', () => {
    watchPanelStore.applyPlaylistProgress('s1', 0, 'sibling', 'sib-a')
    expect(watchPanelStore.get('s2').siblingByIndex).toEqual({})
  })
})

describe('watchPanelStore per-session restore', () => {
  it('keeps each session state in memory so switching back restores it', () => {
    watchPanelStore.setUrl('s1', 'https://one')
    watchPanelStore.setSiblingByIndex('s1', { 0: 'sib-1' })
    watchPanelStore.setUrl('s2', 'https://two')
    // "Switch" to s2 and back: state is keyed by session, nothing is lost.
    expect(watchPanelStore.get('s2').url).toBe('https://two')
    expect(watchPanelStore.get('s1').url).toBe('https://one')
    expect(watchPanelStore.get('s1').siblingByIndex).toEqual({ 0: 'sib-1' })
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
  it('replaces empty state from a snapshot and derives dispatched from siblings', () => {
    watchPanelStore.hydrateSession('s1', {
      url: 'https://playlist',
      playlistFrames: { 1: frames('b') },
      siblingByIndex: { 1: 'sib-1' },
      playlistDispatched: true,
    })
    const state = watchPanelStore.get('s1')
    expect(state.url).toBe('https://playlist')
    expect(state.siblingByIndex).toEqual({ 1: 'sib-1' })
    expect(state.playlistDispatched).toBe(true)
  })

  it('drops a stale snapshot when the user already typed a different URL', () => {
    watchPanelStore.setUrl('s1', 'https://new-url')
    watchPanelStore.hydrateSession('s1', {
      url: 'https://stale-url',
      playlistFrames: { 0: frames('old') },
      siblingByIndex: { 0: 'old-sib' },
      playlistDispatched: true,
    })
    const state = watchPanelStore.get('s1')
    expect(state.url).toBe('https://new-url')
    expect(state.siblingByIndex).toEqual({})
    expect(state.playlistDispatched).toBe(false)
  })

  it('merges live sibling events over the snapshot and derives dispatched from the merge', () => {
    watchPanelStore.setSiblingByIndex('s1', { 2: 'live-sib' })
    watchPanelStore.hydrateSession('s1', {
      url: '',
      playlistFrames: {},
      siblingByIndex: { 0: 'old-sib' },
      playlistDispatched: true,
    })
    const state = watchPanelStore.get('s1')
    expect(state.siblingByIndex).toEqual({ 0: 'old-sib', 2: 'live-sib' })
    expect(state.playlistDispatched).toBe(true)
  })

  it('derives playlistDispatched=false when the snapshot has no surviving siblings', () => {
    watchPanelStore.hydrateSession('s1', {
      url: 'https://playlist',
      playlistFrames: {},
      siblingByIndex: {},
      playlistDispatched: true,
    })
    expect(watchPanelStore.get('s1').playlistDispatched).toBe(false)
  })
})

describe('watchPanelStore.setUrl', () => {
  it('resets post-run state when changing URLs', () => {
    watchPanelStore.setUrl('s1', 'https://youtu.be/old')
    watchPanelStore.setSiblingByIndex('s1', { 0: 'sib-x' })
    watchPanelStore.setPlaylistDispatched('s1', true)
    watchPanelStore.setUrl('s1', 'https://youtu.be/new')
    const state = watchPanelStore.get('s1')
    expect(state.siblingByIndex).toEqual({})
    expect(state.playlistDispatched).toBe(false)
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

describe('watchPanelStore.remapPlaylistEntries', () => {
  it('moves playlistFrames and siblingByIndex to the new index when entries shift', () => {
    watchPanelStore.setUrl('s1', 'https://playlist')
    watchPanelStore.setSiblingByIndex('s1', { 0: 'sib-a', 2: 'sib-c' })
    __watchPanelStoreTestHooks.seedFrames('s1', { 0: frames('a'), 2: frames('c') })

    watchPanelStore.remapPlaylistEntries('s1', [{ url: 'A' }, { url: 'B' }, { url: 'C' }], [{ url: 'A' }, { url: 'C' }])

    const state = watchPanelStore.get('s1')
    expect(state.siblingByIndex).toEqual({ 0: 'sib-a', 1: 'sib-c' })
    expect(state.playlistFrames[0][0].path).toBe('/tmp/a.png')
    expect(state.playlistFrames[1][0].path).toBe('/tmp/c.png')
  })

  it('is a no-op when entry URL lists are identical', () => {
    watchPanelStore.setUrl('s1', 'https://playlist')
    watchPanelStore.setSiblingByIndex('s1', { 0: 'sib-a' })
    const before = watchPanelStore.get('s1')
    watchPanelStore.remapPlaylistEntries('s1', [{ url: 'A' }], [{ url: 'A' }])
    expect(watchPanelStore.get('s1')).toBe(before)
  })
})
