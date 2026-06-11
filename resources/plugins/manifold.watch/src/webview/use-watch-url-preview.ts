// resources/plugins/manifold.watch/src/webview/use-watch-url-preview.ts
// Single-video URL preview: debounced peek with a per-URL cache, plus the
// user-editable prompt (pre-filled with DEFAULT_WATCH_QUESTION and cached per
// URL so edits survive remounts).
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_WATCH_QUESTION } from '../shared-types'
import type { WatchPeekResult, WatchVideoInfo } from '../shared-types'
import {
  type UrlMode,
  peekCache,
  questionCache,
  schedulePersistCaches,
  setCachedPeek,
} from './watch-preview-cache'

export type { UrlMode } from './watch-preview-cache'
export { clearWatchPreviewCaches, __watchUrlPreviewTestHooks } from './watch-preview-cache'

const PEEK_DEBOUNCE_MS = 400
const PLAYLIST_ERROR = 'Playlists are not supported — paste a single video URL.'

interface Deps {
  peekUrl: (url: string) => Promise<WatchPeekResult>
}

interface State {
  mode: UrlMode
  loading: boolean
  error: string | null
  video: WatchVideoInfo | null
  /** The prompt that will be sent to the agent — visible and editable. */
  question: string
  setQuestion: (value: string) => void
  forceRefresh: () => void
}

export function useWatchUrlPreview(url: string, deps: Deps): State {
  const { peekUrl } = deps
  const mode: UrlMode = detectMode(url)
  const trimmed = url.trim()

  // Lazy initializers hydrate from the module cache so a remount with the
  // same URL shows the card instantly — no loading flash, no round-trip.
  const [video, setVideo] = useState<WatchVideoInfo | null>(() => peekCache.get(trimmed) ?? null)
  const [loading, setLoading] = useState<boolean>(() => mode === 'video' && !peekCache.has(trimmed))
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestionState] = useState<string>(() => questionCache.get(trimmed) ?? DEFAULT_WATCH_QUESTION)
  // Bumping this counter forces the URL effect to re-run (e.g. after the
  // user clicks Clear cache).
  const [refreshCounter, setRefreshCounter] = useState(0)
  const forceRefresh = useCallback(() => setRefreshCounter((n) => n + 1), [])

  useEffect(() => {
    if (mode === 'none' || mode === 'playlist') {
      setVideo(null)
      setError(mode === 'playlist' ? PLAYLIST_ERROR : null)
      setLoading(false)
      setQuestionState(DEFAULT_WATCH_QUESTION)
      return
    }

    let cancelled = false
    setQuestionState(questionCache.get(trimmed) ?? DEFAULT_WATCH_QUESTION)

    const applyPeek = (result: WatchPeekResult): void => {
      const next: WatchVideoInfo = {
        url: result.webpageUrl ?? trimmed,
        title: result.title,
        uploader: result.uploader,
        durationSeconds: result.durationSeconds,
        thumbnailDataUrl: result.thumbnailDataUrl,
      }
      setCachedPeek(trimmed, next)
      schedulePersistCaches()
      setVideo(next)
    }

    // Cache hit: hydrate immediately, skip the round-trip and the debounce
    // flash. Then re-peek in the background (stale-while-revalidate) so
    // changed metadata is picked up without making the user wait.
    const cached = peekCache.get(trimmed)
    if (cached) {
      setVideo(cached)
      setError(null)
      setLoading(false)
      void peekUrl(trimmed).then((result) => {
        if (!cancelled && result.ok) applyPeek(result)
      }).catch(() => {
        // Network/yt-dlp blip — keep the cached entry, try again on next mount.
      })
      return () => { cancelled = true }
    }

    setLoading(true)
    setError(null)
    setVideo(null)
    const timer = setTimeout(async () => {
      try {
        const result = await peekUrl(trimmed)
        if (cancelled) return
        if (result.ok) applyPeek(result)
        else setError(result.error ?? 'Could not read video info')
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
  }, [trimmed, mode, peekUrl, refreshCounter])

  // Persist prompt edits to the per-URL cache so they survive remounts.
  const setQuestion = useCallback((value: string) => {
    setQuestionState(value)
    if (!trimmed) return
    questionCache.set(trimmed, value)
    schedulePersistCaches()
  }, [trimmed])

  return { mode, loading, error, video, question, setQuestion, forceRefresh }
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
