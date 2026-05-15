import { describe, it, expect, beforeEach } from 'vitest'
import { watchPanelStore, __watchPanelStoreTestHooks } from './watchPanelStore'
import type { WatchFrameRef } from '../../shared/watch-types'

const frames = (label: string): WatchFrameRef[] => [{ path: `/tmp/${label}.png`, timestampSeconds: 0 }]

beforeEach(() => {
  __watchPanelStoreTestHooks.reset()
})

describe('watchPanelStore.remapPlaylistEntries', () => {
  it('moves playlistFrames and siblingByIndex to the new index when entries shift', () => {
    const sid = 's1'
    watchPanelStore.setUrl(sid, 'https://playlist')
    watchPanelStore.setSiblingByIndex(sid, { 0: 'sib-a', 2: 'sib-c' })
    // Seed frames by mutating via a fake progress event would be heavy; use the
    // exposed remap as our system under test, but seed via setSiblingByIndex
    // and inject frames through a direct update by routing through the store.
    __watchPanelStoreTestHooks.seedFrames(sid, { 0: frames('a'), 2: frames('c') })

    const oldEntries = [{ url: 'A' }, { url: 'B' }, { url: 'C' }]
    const newEntries = [{ url: 'A' }, { url: 'C' }] // B removed
    watchPanelStore.remapPlaylistEntries(sid, oldEntries, newEntries)

    const state = watchPanelStore.get(sid)
    expect(Object.keys(state.siblingByIndex).sort()).toEqual(['0', '1'])
    expect(state.siblingByIndex[0]).toBe('sib-a')
    expect(state.siblingByIndex[1]).toBe('sib-c')
    expect(Object.keys(state.playlistFrames).sort()).toEqual(['0', '1'])
    expect(state.playlistFrames[0][0].path).toBe('/tmp/a.png')
    expect(state.playlistFrames[1][0].path).toBe('/tmp/c.png')
  })

  it('drops frames and siblings whose URL is no longer in the playlist', () => {
    const sid = 's1'
    watchPanelStore.setUrl(sid, 'https://playlist')
    watchPanelStore.setSiblingByIndex(sid, { 1: 'sib-b' })
    __watchPanelStoreTestHooks.seedFrames(sid, { 1: frames('b') })

    const oldEntries = [{ url: 'A' }, { url: 'B' }]
    const newEntries = [{ url: 'A' }] // B removed
    watchPanelStore.remapPlaylistEntries(sid, oldEntries, newEntries)

    const state = watchPanelStore.get(sid)
    expect(state.siblingByIndex).toEqual({})
    expect(state.playlistFrames).toEqual({})
  })

  it('is a no-op when entry URL lists are identical', () => {
    const sid = 's1'
    watchPanelStore.setUrl(sid, 'https://playlist')
    watchPanelStore.setSiblingByIndex(sid, { 0: 'sib-a' })
    __watchPanelStoreTestHooks.seedFrames(sid, { 0: frames('a') })
    const before = watchPanelStore.get(sid)

    watchPanelStore.remapPlaylistEntries(sid, [{ url: 'A' }], [{ url: 'A' }])

    const after = watchPanelStore.get(sid)
    expect(after.siblingByIndex).toBe(before.siblingByIndex)
    expect(after.playlistFrames).toBe(before.playlistFrames)
  })
})
