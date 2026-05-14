import { useCallback, useEffect, useState } from 'react'
import type {
  WatchPeekResult,
  WatchPlaylistPeekResult,
  WatchPlaylistEntry,
} from '../../shared/watch-types'

const PEEK_DEBOUNCE_MS = 400

export type UrlMode = 'none' | 'video' | 'playlist'

interface Deps {
  peekUrl: (url: string) => Promise<WatchPeekResult>
  peekPlaylist: (url: string) => Promise<WatchPlaylistPeekResult>
}

interface State {
  mode: UrlMode
  loading: boolean
  error: string | null
  entries: WatchPlaylistEntry[]
  playlistTitle: string | null
  uploader: string | null
  entryQuestions: string[]
  selectedIndices: Set<number>
  toggleEntrySelected: (index: number) => void
  setAllEntriesSelected: (selected: boolean) => void
  setEntryQuestion: (index: number, value: string) => void
  resetPreview: () => void
}

interface CachedPeek {
  entries: WatchPlaylistEntry[]
  playlistTitle: string | null
  uploader: string | null
}

interface CachedUserState {
  entryQuestions: string[]
  selectedIndices: number[]
}

// Module-level caches survive dockview's panel unmount/remount cycle AND
// — via localStorage — Electron app restarts. Reopening the Watch tab
// (or relaunching the app) shows the cards instantly without re-peeking.
const peekCache = new Map<string, CachedPeek>()
const userStateCache = new Map<string, CachedUserState>()

const PEEK_STORAGE_KEY = 'manifold.watch.peek-cache'
const USER_STATE_STORAGE_KEY = 'manifold.watch.user-state-cache'

;(function hydrateCaches(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const peek = localStorage.getItem(PEEK_STORAGE_KEY)
    if (peek) {
      for (const [k, v] of Object.entries(JSON.parse(peek) as Record<string, CachedPeek>)) {
        if (v && Array.isArray(v.entries)) peekCache.set(k, v)
      }
    }
    const user = localStorage.getItem(USER_STATE_STORAGE_KEY)
    if (user) {
      for (const [k, v] of Object.entries(JSON.parse(user) as Record<string, CachedUserState>)) {
        if (v && Array.isArray(v.entryQuestions) && Array.isArray(v.selectedIndices)) {
          userStateCache.set(k, v)
        }
      }
    }
  } catch { /* corrupted JSON — start fresh */ }
})()

let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistCaches(): void {
  if (typeof localStorage === 'undefined') return
  if (cacheSaveTimer) clearTimeout(cacheSaveTimer)
  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null
    try {
      localStorage.setItem(PEEK_STORAGE_KEY, JSON.stringify(Object.fromEntries(peekCache)))
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(userStateCache)))
    } catch { /* quota or serialization failure — best effort */ }
  }, 500)
}

export const __watchUrlPreviewTestHooks = {
  reset(): void {
    peekCache.clear()
    userStateCache.clear()
    if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(PEEK_STORAGE_KEY)
        localStorage.removeItem(USER_STATE_STORAGE_KEY)
      } catch { /* */ }
    }
  },
}

function getInitialEntries(url: string): WatchPlaylistEntry[] {
  return peekCache.get(url.trim())?.entries ?? []
}

function getInitialQuestions(url: string): string[] {
  const trimmed = url.trim()
  const u = userStateCache.get(trimmed)
  if (u) return u.entryQuestions
  const p = peekCache.get(trimmed)
  return p ? new Array(p.entries.length).fill('') : []
}

function getInitialSelectedIndices(url: string): Set<number> {
  const trimmed = url.trim()
  const u = userStateCache.get(trimmed)
  if (u) return new Set(u.selectedIndices)
  const p = peekCache.get(trimmed)
  return new Set(p ? p.entries.map((_, i) => i) : [])
}

export function useWatchUrlPreview(url: string, deps: Deps): State {
  const { peekUrl, peekPlaylist } = deps
  const mode: UrlMode = detectMode(url)

  // Lazy initializers hydrate from the module cache so a remount with the
  // same URL shows the cards instantly — no loading flash, no IPC.
  const [entries, setEntries] = useState<WatchPlaylistEntry[]>(() => getInitialEntries(url))
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(() => peekCache.get(url.trim())?.playlistTitle ?? null)
  const [uploader, setUploader] = useState<string | null>(() => peekCache.get(url.trim())?.uploader ?? null)
  const [loading, setLoading] = useState<boolean>(() => mode !== 'none' && !peekCache.has(url.trim()))
  const [error, setError] = useState<string | null>(null)
  const [entryQuestions, setEntryQuestions] = useState<string[]>(() => getInitialQuestions(url))
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => getInitialSelectedIndices(url))

  useEffect(() => {
    const trimmed = url.trim()
    if (mode === 'none') {
      setEntries([])
      setPlaylistTitle(null)
      setUploader(null)
      setError(null)
      setLoading(false)
      setSelectedIndices(new Set())
      setEntryQuestions([])
      return
    }

    // Cache hit: hydrate immediately, skip the IPC and the debounce flash.
    const cached = peekCache.get(trimmed)
    if (cached) {
      setEntries(cached.entries)
      setPlaylistTitle(cached.playlistTitle)
      setUploader(cached.uploader)
      setError(null)
      setLoading(false)
      const u = userStateCache.get(trimmed)
      if (u) {
        setEntryQuestions(u.entryQuestions)
        setSelectedIndices(new Set(u.selectedIndices))
      } else {
        setEntryQuestions(new Array(cached.entries.length).fill(''))
        setSelectedIndices(new Set(cached.entries.map((_, i) => i)))
      }
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setEntries([])
    setPlaylistTitle(null)
    setUploader(null)
    setSelectedIndices(new Set())
    const timer = setTimeout(async () => {
      try {
        if (mode === 'playlist') {
          const result = await peekPlaylist(trimmed)
          if (cancelled) return
          if (result.ok) {
            const next: CachedPeek = {
              entries: result.entries,
              playlistTitle: result.playlistTitle ?? null,
              uploader: result.uploader ?? null,
            }
            peekCache.set(trimmed, next)
            schedulePersistCaches()
            setEntries(next.entries)
            setPlaylistTitle(next.playlistTitle)
            setUploader(next.uploader)
            setEntryQuestions(new Array(next.entries.length).fill(''))
            setSelectedIndices(new Set(next.entries.map((_, i) => i)))
          } else {
            setError(result.error ?? 'Could not read playlist')
          }
        } else {
          const result = await peekUrl(trimmed)
          if (cancelled) return
          if (result.ok) {
            // Wrap the single video as a 1-entry "playlist" so downstream UI
            // and run code have one shape to deal with.
            const entry: WatchPlaylistEntry = {
              url: result.webpageUrl ?? trimmed,
              title: result.title,
              uploader: result.uploader,
              durationSeconds: result.durationSeconds,
              thumbnailDataUrl: result.thumbnailDataUrl,
            }
            const next: CachedPeek = { entries: [entry], playlistTitle: null, uploader: null }
            peekCache.set(trimmed, next)
            schedulePersistCaches()
            setEntries(next.entries)
            setEntryQuestions([''])
            setSelectedIndices(new Set([0]))
          } else {
            setError(result.error ?? 'Could not read video info')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Preview failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, PEEK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [url, mode, peekUrl, peekPlaylist])

  // Persist user edits to the per-URL cache so they survive remounts.
  const cacheUserState = useCallback((q: string[], s: Set<number>) => {
    const trimmed = url.trim()
    if (!trimmed) return
    userStateCache.set(trimmed, { entryQuestions: q, selectedIndices: Array.from(s) })
    schedulePersistCaches()
  }, [url])

  const setEntryQuestion = useCallback((index: number, value: string) => {
    setEntryQuestions((prev) => {
      const next = prev.slice()
      next[index] = value
      cacheUserState(next, selectedIndices)
      return next
    })
  }, [cacheUserState, selectedIndices])

  const resetPreview = useCallback(() => {
    setEntries([])
    setPlaylistTitle(null)
    setUploader(null)
    setEntryQuestions([])
    setSelectedIndices(new Set())
    setError(null)
  }, [])

  const toggleEntrySelected = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      cacheUserState(entryQuestions, next)
      return next
    })
  }, [cacheUserState, entryQuestions])

  const setAllEntriesSelected = useCallback((selected: boolean) => {
    setSelectedIndices(() => {
      const next = !selected || entries.length === 0
        ? new Set<number>()
        : new Set(entries.map((_, i) => i))
      cacheUserState(entryQuestions, next)
      return next
    })
  }, [cacheUserState, entries, entryQuestions])

  return {
    mode, loading, error,
    entries, playlistTitle, uploader,
    entryQuestions, selectedIndices,
    toggleEntrySelected, setAllEntriesSelected,
    setEntryQuestion,
    resetPreview,
  }
}

function detectMode(url: string): UrlMode {
  const trimmed = url.trim()
  if (!isHttpUrl(trimmed)) return 'none'
  return isPlaylistUrl(trimmed) ? 'playlist' : 'video'
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function isPlaylistUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.pathname === '/playlist'
  } catch {
    return false
  }
}
