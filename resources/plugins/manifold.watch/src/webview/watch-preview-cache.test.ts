import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  peekCache,
  questionCache,
  setCachedPeek,
  schedulePersistCaches,
  hydratePreviewCaches,
  clearWatchPreviewCaches,
  __watchUrlPreviewTestHooks,
  PEEK_STORAGE_KEY,
  QUESTION_STORAGE_KEY,
} from './watch-preview-cache'

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

  it('LRU-caps the peek cache to 50 URLs', () => {
    for (let i = 0; i < 55; i++) {
      setCachedPeek(`v${i}`, { url: `v${i}`, title: 't' })
    }
    expect(peekCache.size).toBe(50)
    // The oldest URLs were evicted; the newest remain.
    expect(peekCache.has('v0')).toBe(false)
    expect(peekCache.has('v54')).toBe(true)
  })

  it('strips base64 thumbnails from the persisted form', () => {
    setCachedPeek('vid', { url: 'vid', title: 't', thumbnailDataUrl: 'data:image/png;base64,AAAA' })
    // In-memory entry keeps the thumbnail for rendering.
    expect(peekCache.get('vid')?.thumbnailDataUrl).toBe('data:image/png;base64,AAAA')

    schedulePersistCaches()
    vi.advanceTimersByTime(600)

    const call = persist.mock.calls.find(([key]) => key === PEEK_STORAGE_KEY)
    expect(call).toBeDefined()
    const persisted = (call as unknown[])[1] as Record<string, { url: string; thumbnailDataUrl?: string }>
    expect(persisted.vid.thumbnailDataUrl).toBeUndefined()
    expect(persisted.vid.url).toBe('vid')
  })

  it('hydrates from init.persisted with in-memory entries winning; old playlist blobs are ignored', () => {
    peekCache.set('vid', { url: 'vid', title: 'live' })
    hydratePreviewCaches({
      [PEEK_STORAGE_KEY]: {
        vid: { url: 'vid', title: 'stale' },
        other: { url: 'other', title: 'other title' },
        // Shape written by the retired playlist format — must be skipped.
        legacy: { entries: [{ url: 'legacy' }], playlistTitle: 'pl', uploader: 'up' },
      },
      [QUESTION_STORAGE_KEY]: {
        other: 'custom prompt',
        legacy: { entryQuestions: ['q'], selectedIndices: [0] },
      },
    })
    expect(peekCache.get('vid')?.title).toBe('live')
    expect(peekCache.get('other')?.title).toBe('other title')
    expect(peekCache.has('legacy')).toBe(false)
    expect(questionCache.get('other')).toBe('custom prompt')
    expect(questionCache.has('legacy')).toBe(false)
  })

  it('clearWatchPreviewCaches wipes memory and persists empty blobs immediately', () => {
    peekCache.set('vid', { url: 'vid' })
    questionCache.set('vid', 'prompt')
    clearWatchPreviewCaches()
    expect(peekCache.size).toBe(0)
    expect(questionCache.size).toBe(0)
    expect(persist).toHaveBeenCalledWith(PEEK_STORAGE_KEY, {})
    expect(persist).toHaveBeenCalledWith(QUESTION_STORAGE_KEY, {})
  })
})
