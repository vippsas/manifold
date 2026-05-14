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

export function useWatchUrlPreview(url: string, deps: Deps): State {
  const { peekUrl, peekPlaylist } = deps
  const [entries, setEntries] = useState<WatchPlaylistEntry[]>([])
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null)
  const [uploader, setUploader] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entryQuestions, setEntryQuestions] = useState<string[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set())

  const mode: UrlMode = detectMode(url)

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
            setEntries(result.entries)
            setPlaylistTitle(result.playlistTitle ?? null)
            setUploader(result.uploader ?? null)
            setEntryQuestions(new Array(result.entries.length).fill(''))
            setSelectedIndices(new Set(result.entries.map((_, i) => i)))
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
            setEntries([entry])
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

  const setEntryQuestion = useCallback((index: number, value: string) => {
    setEntryQuestions((prev) => {
      const next = prev.slice()
      next[index] = value
      return next
    })
  }, [])

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
      return next
    })
  }, [])

  const setAllEntriesSelected = useCallback((selected: boolean) => {
    setSelectedIndices(() => {
      if (entries.length === 0) return new Set()
      if (!selected) return new Set()
      return new Set(entries.map((_, i) => i))
    })
  }, [entries])

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
