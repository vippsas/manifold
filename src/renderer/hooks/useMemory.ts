import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  MemorySearchResponse,
  MemorySearchResult,
  MemoryStats,
  MemoryTimelineItem,
  MemoryTimelineResponse,
  ObservationType,
} from '../../shared/memory-types'

export interface UseMemoryResult {
  searchResults: MemorySearchResult[]
  stats: MemoryStats | null
  timeline: MemoryTimelineItem[]
  error: string | null
  isSearching: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  search: (query: string, type?: ObservationType) => Promise<void>
  loadTimeline: (reset?: boolean) => Promise<void>
  loadStats: () => Promise<void>
  deleteObservation: (observationId: string) => Promise<void>
  clearMemory: () => Promise<void>
  timelineHasMore: boolean
}

function formatMemoryError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''

  if (/better_sqlite3\.node/.test(message) && /NODE_MODULE_VERSION/.test(message)) {
    return 'Memory backend unavailable. better-sqlite3 was built for the wrong Electron runtime.'
  }

  return message.trim() || 'Memory backend unavailable.'
}

export function useMemory(activeProjectId: string | null): UseMemoryResult {
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [timeline, setTimeline] = useState<MemoryTimelineItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQueryState] = useState('')
  const [timelineHasMore, setTimelineHasMore] = useState(false)

  const timelineCursorRef = useRef<number | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string, type?: ObservationType) => {
    if (!activeProjectId || !query.trim()) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const result = (await window.electronAPI.invoke('memory:search', {
        projectId: activeProjectId,
        query: query.trim(),
        type,
        limit: 20,
      })) as MemorySearchResponse
      setSearchResults(result.results)
      setError(null)
    } catch (error) {
      setSearchResults([])
      setError(formatMemoryError(error))
    } finally {
      setIsSearching(false)
    }
  }, [activeProjectId])

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    debounceTimerRef.current = setTimeout(() => {
      void search(query)
    }, 300)
  }, [search])

  const loadTimeline = useCallback(async (reset?: boolean) => {
    if (!activeProjectId) return
    const cursor = reset ? undefined : timelineCursorRef.current ?? undefined
    try {
      const result = (await window.electronAPI.invoke('memory:timeline', {
        projectId: activeProjectId,
        cursor,
        limit: 20,
      })) as MemoryTimelineResponse
      const items = result.items
      if (reset) {
        setTimeline(items)
      } else {
        setTimeline((prev) => [...prev, ...items])
      }
      timelineCursorRef.current = result.nextCursor
      setTimelineHasMore(result.nextCursor !== null)
      setError(null)
    } catch (error) {
      if (reset) {
        setTimeline([])
      }
      setTimelineHasMore(false)
      setError(formatMemoryError(error))
    }
  }, [activeProjectId])

  const loadStats = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const result = (await window.electronAPI.invoke('memory:stats', activeProjectId)) as MemoryStats
      setStats(result)
    } catch {
      setStats(null)
    }
  }, [activeProjectId])

  const deleteObservation = useCallback(async (observationId: string) => {
    if (!activeProjectId) return
    try {
      await window.electronAPI.invoke('memory:delete', activeProjectId, observationId)
      setTimeline((prev) => prev.filter((o) => o.id !== observationId))
      setSearchResults((prev) => prev.filter((r) => r.id !== observationId))
      setError(null)
      void loadStats()
    } catch (error) {
      setError(formatMemoryError(error))
    }
  }, [activeProjectId, loadStats])

  const clearMemory = useCallback(async () => {
    if (!activeProjectId) return
    try {
      await window.electronAPI.invoke('memory:clear', activeProjectId)
      setTimeline([])
      setSearchResults([])
      setStats(null)
      setError(null)
    } catch (error) {
      setError(formatMemoryError(error))
    }
  }, [activeProjectId])

  // Reset state when project changes; clean up debounce timer on unmount
  useEffect(() => {
    setSearchResults([])
    setTimeline([])
    setStats(null)
    setError(null)
    setSearchQueryState('')
    timelineCursorRef.current = null
    setTimelineHasMore(false)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [activeProjectId])

  return {
    searchResults,
    stats,
    timeline,
    error,
    isSearching,
    searchQuery,
    setSearchQuery,
    search,
    loadTimeline,
    loadStats,
    deleteObservation,
    clearMemory,
    timelineHasMore,
  }
}
