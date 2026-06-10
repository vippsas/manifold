import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WatchPeekResult, WatchPlaylistPeekResult } from '../../shared/watch-types'
import {
  peekCache,
  revalidate,
  schedulePersistCaches,
  __watchUrlPreviewTestHooks,
  type RevalidateApply,
} from './watch-preview-cache'

const PEEK_STORAGE_KEY = 'manifold.watch.peek-cache'

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
  beforeEach(() => {
    // jsdom in this runner ships an incomplete localStorage; install a simple
    // in-memory one so the persist path is exercised deterministically.
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    })
    __watchUrlPreviewTestHooks.reset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    __watchUrlPreviewTestHooks.reset()
    vi.unstubAllGlobals()
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

  it('strips base64 thumbnails from the persisted localStorage form', async () => {
    await revalidate('vid', 'video', videoPeek('vid', 'data:image/png;base64,AAAA'), noPlaylist, () => false, noopApply)
    // In-memory entry keeps the thumbnail for rendering.
    expect(peekCache.get('vid')?.entries[0].thumbnailDataUrl).toBe('data:image/png;base64,AAAA')

    schedulePersistCaches()
    vi.advanceTimersByTime(600)

    const raw = localStorage.getItem(PEEK_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('base64')
    const parsed = JSON.parse(raw as string)
    expect(parsed.vid.entries[0].thumbnailDataUrl).toBeUndefined()
    expect(parsed.vid.entries[0].url).toBe('vid')
  })
})
