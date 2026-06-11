// resources/plugins/manifold.watch/src/webview/watch-preview-cache.ts
// Ported from src/renderer/hooks/watch-preview-cache.ts. localStorage is
// replaced by the host `persist` bridge (same keys, same payload shapes);
// hydration comes from init.persisted via hydratePreviewCaches().
import type {
  WatchPeekResult,
  WatchPlaylistPeekResult,
  WatchPlaylistEntry,
} from '../shared-types'
import { postPersist } from './host-post'

export type UrlMode = 'none' | 'video' | 'playlist'

export interface CachedPeek {
  entries: WatchPlaylistEntry[]
  playlistTitle: string | null
  uploader: string | null
}

interface CachedUserState {
  entryQuestions: string[]
  selectedIndices: number[]
}

// Module-level caches survive the panel's unmount/remount cycle AND — via the
// host's persisted blob — app restarts. Reopening the Watch tab (or
// relaunching the app) shows the cards instantly without re-peeking.
export const peekCache = new Map<string, CachedPeek>()
export const userStateCache = new Map<string, CachedUserState>()

export const PEEK_STORAGE_KEY = 'manifold.watch.peek-cache'
export const USER_STATE_STORAGE_KEY = 'manifold.watch.user-state-cache'

let persistFn: (key: string, value: unknown) => void = postPersist

// Cap the number of previewed URLs we keep in memory / persist. Map iteration
// order is insertion order, so evicting from the front drops the least-recently
// inserted URLs. Without this the caches grow monotonically per previewed URL.
const MAX_CACHED_URLS = 50

/** Insert into peek+user-state caches, evicting the oldest URL(s) past the cap. */
function setCappedPeek(url: string, peek: CachedPeek): void {
  peekCache.delete(url)
  peekCache.set(url, peek)
  while (peekCache.size > MAX_CACHED_URLS) {
    const oldest = peekCache.keys().next().value as string | undefined
    if (oldest === undefined) break
    peekCache.delete(oldest)
    userStateCache.delete(oldest)
  }
}

/** Strip base64 thumbnails from entries before persisting to the host. */
function stripThumbnails(peek: CachedPeek): CachedPeek {
  return {
    ...peek,
    entries: peek.entries.map(({ thumbnailDataUrl: _omit, ...rest }) => rest),
  }
}

/** Hydrate from the host-persisted blob (init.persisted). In-memory entries
 *  win (the persist round-trip is debounced, so memory is always fresher). */
export function hydratePreviewCaches(persisted: Record<string, unknown>): void {
  const peek = persisted[PEEK_STORAGE_KEY]
  if (peek && typeof peek === 'object') {
    for (const [k, v] of Object.entries(peek as Record<string, CachedPeek>)) {
      if (v && Array.isArray(v.entries) && !peekCache.has(k)) setCappedPeek(k, v)
    }
  }
  const user = persisted[USER_STATE_STORAGE_KEY]
  if (user && typeof user === 'object') {
    for (const [k, v] of Object.entries(user as Record<string, CachedUserState>)) {
      if (v && Array.isArray(v.entryQuestions) && Array.isArray(v.selectedIndices) && !userStateCache.has(k)) {
        userStateCache.set(k, v)
      }
    }
  }
}

let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null
export function schedulePersistCaches(): void {
  if (cacheSaveTimer) clearTimeout(cacheSaveTimer)
  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null
    const persistablePeek: Record<string, CachedPeek> = {}
    for (const [k, v] of peekCache) persistablePeek[k] = stripThumbnails(v)
    persistFn(PEEK_STORAGE_KEY, persistablePeek)
    persistFn(USER_STATE_STORAGE_KEY, Object.fromEntries(userStateCache))
  }, 500)
}

function entriesEqual(a: WatchPlaylistEntry[], b: WatchPlaylistEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].url !== b[i].url || a[i].title !== b[i].title) return false
  }
  return true
}

export interface RevalidateApply {
  applyEntries: (e: WatchPlaylistEntry[]) => void
  applyTitle: (t: string | null) => void
  applyUploader: (u: string | null) => void
  applyQuestions: (q: string[]) => void
  applySelected: (s: Set<number>) => void
}

/**
 * Background refresh of a cached peek. If YouTube has changed the playlist
 * (added/removed/reordered videos), update the cache and the UI. User edits
 * (questions, selections) are preserved by entry URL so customizations stick
 * to the right video.
 */
export async function revalidate(
  trimmed: string,
  mode: UrlMode,
  peekUrl: (u: string) => Promise<WatchPeekResult>,
  peekPlaylist: (u: string) => Promise<WatchPlaylistPeekResult>,
  isCancelled: () => boolean,
  apply: RevalidateApply,
): Promise<void> {
  try {
    let fresh: CachedPeek | null = null
    if (mode === 'playlist') {
      const r = await peekPlaylist(trimmed)
      if (r.ok) fresh = { entries: r.entries, playlistTitle: r.playlistTitle ?? null, uploader: r.uploader ?? null }
    } else if (mode === 'video') {
      const r = await peekUrl(trimmed)
      if (r.ok) {
        fresh = {
          entries: [{
            url: r.webpageUrl ?? trimmed,
            title: r.title,
            uploader: r.uploader,
            durationSeconds: r.durationSeconds,
            thumbnailDataUrl: r.thumbnailDataUrl,
          }],
          playlistTitle: null,
          uploader: null,
        }
      }
    }
    if (!fresh || isCancelled()) return

    const old = peekCache.get(trimmed)
    if (old && entriesEqual(old.entries, fresh.entries)) {
      // Entries identical — only update if metadata changed.
      if (old.playlistTitle !== fresh.playlistTitle || old.uploader !== fresh.uploader) {
        setCappedPeek(trimmed, fresh)
        schedulePersistCaches()
        apply.applyTitle(fresh.playlistTitle)
        apply.applyUploader(fresh.uploader)
      }
      return
    }

    // Entries changed. Update cache + UI, and preserve user customizations
    // by entry URL (so e.g. a question attached to video X stays on video X
    // even if videos before it were removed).
    setCappedPeek(trimmed, fresh)
    const oldUser = userStateCache.get(trimmed)
    const oldUrlToIdx = new Map((old?.entries ?? []).map((e, i) => [e.url, i]))
    const oldQuestions = oldUser?.entryQuestions ?? []
    const oldSelectedSet = new Set(oldUser?.selectedIndices ?? (old?.entries.map((_, i) => i) ?? []))
    const newQuestions = fresh.entries.map((e) => {
      const oldIdx = oldUrlToIdx.get(e.url)
      return oldIdx !== undefined ? (oldQuestions[oldIdx] ?? '') : ''
    })
    const newSelected = new Set<number>()
    fresh.entries.forEach((e, newIdx) => {
      const oldIdx = oldUrlToIdx.get(e.url)
      // Existing entry → preserve selection state. New entry → selected by default.
      if (oldIdx === undefined || oldSelectedSet.has(oldIdx)) newSelected.add(newIdx)
    })
    userStateCache.set(trimmed, {
      entryQuestions: newQuestions,
      selectedIndices: Array.from(newSelected),
    })
    schedulePersistCaches()
    apply.applyEntries(fresh.entries)
    apply.applyTitle(fresh.playlistTitle)
    apply.applyUploader(fresh.uploader)
    apply.applyQuestions(newQuestions)
    apply.applySelected(newSelected)
  } catch {
    // Network/yt-dlp blip — keep the cached entries, try again on next mount.
  }
}

/**
 * Wipe the peek + user-state caches (in-memory + host-persisted). Used by the
 * "Clear cache" UI affordance so the next peek hits yt-dlp fresh.
 */
export function clearWatchPreviewCaches(): void {
  peekCache.clear()
  userStateCache.clear()
  if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null }
  persistFn(PEEK_STORAGE_KEY, {})
  persistFn(USER_STATE_STORAGE_KEY, {})
}

export const __watchUrlPreviewTestHooks = {
  reset(): void {
    peekCache.clear()
    userStateCache.clear()
    if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null }
    persistFn = postPersist
  },
  setPersist(fn: (key: string, value: unknown) => void): void {
    persistFn = fn
  },
}

export function getInitialEntries(url: string): WatchPlaylistEntry[] {
  return peekCache.get(url.trim())?.entries ?? []
}

export function getInitialQuestions(url: string): string[] {
  const trimmed = url.trim()
  const u = userStateCache.get(trimmed)
  if (u) return u.entryQuestions
  const p = peekCache.get(trimmed)
  return p ? new Array(p.entries.length).fill('') : []
}

export function getInitialSelectedIndices(url: string): Set<number> {
  const trimmed = url.trim()
  const u = userStateCache.get(trimmed)
  if (u) return new Set(u.selectedIndices)
  const p = peekCache.get(trimmed)
  return new Set(p ? p.entries.map((_, i) => i) : [])
}
