// resources/plugins/manifold.watch/src/webview/use-watch-url-preview.ts
// Ported from src/renderer/hooks/useWatchUrlPreview.ts (only import paths
// changed; the cache module handles the localStorage → host-persist swap).
import { useCallback, useEffect, useState } from 'react'
import type {
  WatchPeekResult,
  WatchPlaylistPeekResult,
  WatchPlaylistEntry,
} from '../shared-types'
import {
  type CachedPeek,
  type UrlMode,
  getInitialEntries,
  getInitialQuestions,
  getInitialSelectedIndices,
  peekCache,
  revalidate,
  schedulePersistCaches,
  userStateCache,
} from './watch-preview-cache'

export type { UrlMode } from './watch-preview-cache'
export { clearWatchPreviewCaches, __watchUrlPreviewTestHooks } from './watch-preview-cache'

const PEEK_DEBOUNCE_MS = 400

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
  forceRefresh: () => void
}

export function useWatchUrlPreview(url: string, deps: Deps): State {
  const { peekUrl, peekPlaylist } = deps
  const mode: UrlMode = detectMode(url)

  // Lazy initializers hydrate from the module cache so a remount with the
  // same URL shows the cards instantly — no loading flash, no round-trip.
  const [entries, setEntries] = useState<WatchPlaylistEntry[]>(() => getInitialEntries(url))
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(() => peekCache.get(url.trim())?.playlistTitle ?? null)
  const [uploader, setUploader] = useState<string | null>(() => peekCache.get(url.trim())?.uploader ?? null)
  const [loading, setLoading] = useState<boolean>(() => mode !== 'none' && !peekCache.has(url.trim()))
  const [error, setError] = useState<string | null>(null)
  const [entryQuestions, setEntryQuestions] = useState<string[]>(() => getInitialQuestions(url))
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => getInitialSelectedIndices(url))
  // Bumping this counter forces the URL effect to re-run (e.g. after the
  // user clicks Clear cache).
  const [refreshCounter, setRefreshCounter] = useState(0)
  const forceRefresh = useCallback(() => setRefreshCounter((n) => n + 1), [])

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

    let cancelled = false

    // Cache hit: hydrate immediately, skip the round-trip and the debounce
    // flash. Then re-peek in the background (stale-while-revalidate) so
    // changes to the playlist on YouTube — added/removed videos — are picked
    // up without forcing the user to wait on every panel mount.
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
      void revalidate(trimmed, mode, peekUrl, peekPlaylist, () => cancelled, {
        applyEntries: setEntries,
        applyTitle: setPlaylistTitle,
        applyUploader: setUploader,
        applyQuestions: setEntryQuestions,
        applySelected: setSelectedIndices,
      })
      return () => { cancelled = true }
    }
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
  }, [url, mode, peekUrl, peekPlaylist, refreshCounter])

  // Persist user edits to the per-URL cache so they survive remounts.
  const cacheUserState = useCallback((q: string[], s: Set<number>) => {
    const trimmed = url.trim()
    if (!trimmed) return
    userStateCache.set(trimmed, { entryQuestions: q, selectedIndices: Array.from(s) })
    schedulePersistCaches()
  }, [url])

  const setEntryQuestion = useCallback((index: number, value: string) => {
    const next = entryQuestions.slice()
    next[index] = value
    setEntryQuestions(next)
    cacheUserState(next, selectedIndices)
  }, [cacheUserState, entryQuestions, selectedIndices])

  const resetPreview = useCallback(() => {
    setEntries([])
    setPlaylistTitle(null)
    setUploader(null)
    setEntryQuestions([])
    setSelectedIndices(new Set())
    setError(null)
  }, [])

  const toggleEntrySelected = useCallback((index: number) => {
    const next = new Set(selectedIndices)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelectedIndices(next)
    cacheUserState(entryQuestions, next)
  }, [cacheUserState, entryQuestions, selectedIndices])

  const setAllEntriesSelected = useCallback((selected: boolean) => {
    const next = !selected || entries.length === 0
      ? new Set<number>()
      : new Set(entries.map((_, i) => i))
    setSelectedIndices(next)
    cacheUserState(entryQuestions, next)
  }, [cacheUserState, entries, entryQuestions])

  return {
    mode, loading, error,
    entries, playlistTitle, uploader,
    entryQuestions, selectedIndices,
    toggleEntrySelected, setAllEntriesSelected,
    setEntryQuestion,
    resetPreview,
    forceRefresh,
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
