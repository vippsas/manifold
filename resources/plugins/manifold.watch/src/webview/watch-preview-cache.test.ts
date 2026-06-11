import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WatchPeekResult, WatchPlaylistPeekResult } from '../shared-types'
import {
  peekCache,
  userStateCache,
  revalidate,
  schedulePersistCaches,
  hydratePreviewCaches,
  clearWatchPreviewCaches,
  __watchUrlPreviewTestHooks,
  PEEK_STORAGE_KEY,
  USER_STATE_STORAGE_KEY,
  type RevalidateApply,
} from './watch-preview-cache'

const noopApply: RevalidateApply = {
  applyEntries: () => {},
  applyTitle: () => {},
  applyUploader: () => {},
  applyQuestions: () => {},
  applySelected: () => {},
}

function videoPeek(url: string, thumb: string): (u: string) => Promise<WatchPeekResult> {
  return async () => ({ ok: true, webpageUrl: url, title: 't', thumbnailDataUrl: thumb } as WatchPeekResult)
}

const noPlaylist = async (): Promise<WatchPlaylistPeekResult> => ({ ok: false, entries: [] })

describe('watch-preview-cache', () => {
  const persist = vi.fn()

  beforeEach(() => {
    persist.mockClear()
    __watchUrlPreviewTestHooks.reset()
    __watchUrlPreviewTestHooks.setPersist(persist)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    __watchUrlPreviewTestHooks.reset()
  })

  it('LRU-caps the peek cache to 50 URLs', async () => {
    for (let i = 0; i < 55; i++) {
      await revalidate(`v${i}`, 'video', videoPeek(`v${i}`, 'data:thumb'), noPlaylist, () => false, noopApply)
    }
    expect(peekCache.size).toBe(50)
    // The oldest URLs were evicted; the newest remain.
    expect(peekCache.has('v0')).toBe(false)
    expect(peekCache.has('v54')).toBe(true)
  })

  it('strips base64 thumbnails from the persisted form', async () => {
    await revalidate('vid', 'video', videoPeek('vid', 'data:image/png;base64,AAAA'), noPlaylist, () => false, noopApply)
    // In-memory entry keeps the thumbnail for rendering.
    expect(peekCache.get('vid')?.entries[0].thumbnailDataUrl).toBe('data:image/png;base64,AAAA')

    schedulePersistCaches()
    vi.advanceTimersByTime(600)

    const call = persist.mock.calls.find(([key]) => key === PEEK_STORAGE_KEY)
    expect(call).toBeDefined()
    const persisted = (call as unknown[])[1] as Record<string, { entries: Array<{ url: string; thumbnailDataUrl?: string }> }>
    expect(persisted.vid.entries[0].thumbnailDataUrl).toBeUndefined()
    expect(persisted.vid.entries[0].url).toBe('vid')
  })

  it('hydrates from init.persisted with in-memory entries winning', () => {
    peekCache.set('vid', { entries: [{ url: 'vid', title: 'live' }], playlistTitle: null, uploader: null })
    hydratePreviewCaches({
      [PEEK_STORAGE_KEY]: {
        vid: { entries: [{ url: 'vid', title: 'stale' }], playlistTitle: null, uploader: null },
        other: { entries: [{ url: 'other' }], playlistTitle: 'pl', uploader: 'up' },
      },
      [USER_STATE_STORAGE_KEY]: {
        other: { entryQuestions: ['q'], selectedIndices: [0] },
      },
    })
    expect(peekCache.get('vid')?.entries[0].title).toBe('live')
    expect(peekCache.get('other')?.playlistTitle).toBe('pl')
    expect(userStateCache.get('other')).toEqual({ entryQuestions: ['q'], selectedIndices: [0] })
  })

  it('clearWatchPreviewCaches wipes memory and persists empty blobs immediately', () => {
    peekCache.set('vid', { entries: [{ url: 'vid' }], playlistTitle: null, uploader: null })
    userStateCache.set('vid', { entryQuestions: [''], selectedIndices: [0] })
    clearWatchPreviewCaches()
    expect(peekCache.size).toBe(0)
    expect(userStateCache.size).toBe(0)
    expect(persist).toHaveBeenCalledWith(PEEK_STORAGE_KEY, {})
    expect(persist).toHaveBeenCalledWith(USER_STATE_STORAGE_KEY, {})
  })
})
