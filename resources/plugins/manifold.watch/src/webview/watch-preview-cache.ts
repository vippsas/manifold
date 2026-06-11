// resources/plugins/manifold.watch/src/webview/watch-preview-cache.ts
// Per-URL peek + prompt caches for the Watch panel. localStorage is replaced
// by the host `persist` bridge; hydration comes from init.persisted via
// hydratePreviewCaches().
import type { WatchVideoInfo } from '../shared-types'
import { postPersist } from './host-post'

export type UrlMode = 'none' | 'video' | 'playlist'

// Module-level caches survive the panel's unmount/remount cycle AND — via the
// host's persisted blob — app restarts. Reopening the Watch tab (or
// relaunching the app) shows the card instantly without re-peeking.
export const peekCache = new Map<string, WatchVideoInfo>()
/** The user's edited prompt per URL (absent = the default prompt). */
export const questionCache = new Map<string, string>()

export const PEEK_STORAGE_KEY = 'manifold.watch.peek-cache'
export const QUESTION_STORAGE_KEY = 'manifold.watch.question-cache'

let persistFn: (key: string, value: unknown) => void = postPersist

// Cap the number of previewed URLs we keep in memory / persist. Map iteration
// order is insertion order, so evicting from the front drops the least-recently
// inserted URLs. Without this the caches grow monotonically per previewed URL.
const MAX_CACHED_URLS = 50

/** Insert into the peek+question caches, evicting the oldest URL(s) past the cap. */
export function setCachedPeek(url: string, video: WatchVideoInfo): void {
  peekCache.delete(url)
  peekCache.set(url, video)
  while (peekCache.size > MAX_CACHED_URLS) {
    const oldest = peekCache.keys().next().value as string | undefined
    if (oldest === undefined) break
    peekCache.delete(oldest)
    questionCache.delete(oldest)
  }
}

/** Strip the base64 thumbnail before persisting to the host. */
function stripThumbnail(video: WatchVideoInfo): WatchVideoInfo {
  const { thumbnailDataUrl: _omit, ...rest } = video
  return rest
}

/** Hydrate from the host-persisted blob (init.persisted). In-memory entries
 *  win (the persist round-trip is debounced, so memory is always fresher).
 *  Blobs written by the retired playlist format fail the shape checks and are
 *  ignored. */
export function hydratePreviewCaches(persisted: Record<string, unknown>): void {
  const peek = persisted[PEEK_STORAGE_KEY]
  if (peek && typeof peek === 'object') {
    for (const [k, v] of Object.entries(peek as Record<string, WatchVideoInfo>)) {
      if (v && typeof v.url === 'string' && !peekCache.has(k)) setCachedPeek(k, v)
    }
  }
  const questions = persisted[QUESTION_STORAGE_KEY]
  if (questions && typeof questions === 'object') {
    for (const [k, v] of Object.entries(questions as Record<string, string>)) {
      if (typeof v === 'string' && !questionCache.has(k)) questionCache.set(k, v)
    }
  }
}

let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null
export function schedulePersistCaches(): void {
  if (cacheSaveTimer) clearTimeout(cacheSaveTimer)
  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null
    const persistablePeek: Record<string, WatchVideoInfo> = {}
    for (const [k, v] of peekCache) persistablePeek[k] = stripThumbnail(v)
    persistFn(PEEK_STORAGE_KEY, persistablePeek)
    persistFn(QUESTION_STORAGE_KEY, Object.fromEntries(questionCache))
  }, 500)
}

/**
 * Wipe the peek + prompt caches (in-memory + host-persisted). Used by the
 * "Clear cache" UI affordance so the next peek hits yt-dlp fresh.
 */
export function clearWatchPreviewCaches(): void {
  peekCache.clear()
  questionCache.clear()
  if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null }
  persistFn(PEEK_STORAGE_KEY, {})
  persistFn(QUESTION_STORAGE_KEY, {})
}

export const __watchUrlPreviewTestHooks = {
  reset(): void {
    peekCache.clear()
    questionCache.clear()
    if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null }
    persistFn = postPersist
  },
  setPersist(fn: (key: string, value: unknown) => void): void {
    persistFn = fn
  },
}
