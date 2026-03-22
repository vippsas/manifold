import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  SearchContextResponse,
  SearchMode,
  SearchQueryRequest,
  SearchQueryResponse,
  SearchScopeDescriptor,
  SearchScopeKind,
  SearchMatchMode,
  UnifiedSearchResult,
} from '../../shared/search-types'

export interface UseSearchResult {
  context: SearchContextResponse | null
  mode: SearchMode
  setMode: (mode: SearchMode) => void
  query: string
  setQuery: (query: string) => void
  scopeKind: SearchScopeKind
  setScopeKind: (scope: SearchScopeKind) => void
  matchMode: SearchMatchMode
  setMatchMode: (mode: SearchMatchMode) => void
  caseSensitive: boolean
  setCaseSensitive: (value: boolean) => void
  wholeWord: boolean
  setWholeWord: (value: boolean) => void
  results: UnifiedSearchResult[]
  warnings: string[]
  isSearching: boolean
  error: string | null
}

const DEFAULT_LIMIT = 100

export function useSearch(activeProjectId: string | null, activeSessionId: string | null): UseSearchResult {
  const [context, setContext] = useState<SearchContextResponse | null>(null)
  const [mode, setMode] = useState<SearchMode>('code')
  const [query, setQuery] = useState('')
  const [scopeKind, setScopeKind] = useState<SearchScopeKind>('active-session')
  const [matchMode, setMatchMode] = useState<SearchMatchMode>('literal')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!activeProjectId) {
      setContext(null)
      return
    }

    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const nextContext = await window.electronAPI.invoke('search:context', activeProjectId, activeSessionId) as SearchContextResponse
        if (!cancelled) {
          setContext(nextContext)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setContext(null)
          setError(formatSearchError(nextError))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, activeSessionId])

  useEffect(() => {
    setResults([])
    setWarnings([])
    setError(null)
    setQuery('')
    setMode('code')
    setScopeKind('active-session')
    setMatchMode('literal')
    setCaseSensitive(false)
    setWholeWord(false)
  }, [activeProjectId])

  const effectiveScope = useMemo<SearchScopeDescriptor>(() => {
    if (mode === 'memory') return { kind: 'memory-only' }
    return { kind: scopeKind }
  }, [mode, scopeKind])

  const search = useCallback(async (): Promise<void> => {
    if (!activeProjectId || !query.trim()) {
      setResults([])
      setWarnings([])
      return
    }

    const requestId = ++requestIdRef.current
    const request: SearchQueryRequest = {
      projectId: activeProjectId,
      activeSessionId,
      mode,
      query: query.trim(),
      scope: effectiveScope,
      matchMode,
      caseSensitive,
      wholeWord,
      limit: DEFAULT_LIMIT,
      contextLines: 1,
    }

    setIsSearching(true)
    try {
      const response = await window.electronAPI.invoke('search:query', request) as SearchQueryResponse
      if (requestId !== requestIdRef.current) return
      setResults(response.results)
      setWarnings(response.warnings ?? [])
      setError(null)
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return
      setResults([])
      setWarnings([])
      setError(formatSearchError(nextError))
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSearching(false)
      }
    }
  }, [activeProjectId, activeSessionId, mode, query, effectiveScope, matchMode, caseSensitive, wholeWord])

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (!query.trim()) {
      setResults([])
      setWarnings([])
      setIsSearching(false)
      return
    }
    debounceTimerRef.current = setTimeout(() => {
      void search()
    }, 250)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [query, mode, effectiveScope, matchMode, caseSensitive, wholeWord, search])

  return {
    context,
    mode,
    setMode,
    query,
    setQuery,
    scopeKind,
    setScopeKind,
    matchMode,
    setMatchMode,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    results,
    warnings,
    isSearching,
    error,
  }
}

function formatSearchError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Search failed.'
}
