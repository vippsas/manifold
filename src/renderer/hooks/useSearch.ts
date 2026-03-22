import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ObservationType } from '../../shared/memory-types'
import type {
  SearchAskResponse,
  SearchContextResponse,
  SearchMode,
  SearchQueryResponse,
  SearchScopeDescriptor,
  SearchScopeKind,
  SearchMatchMode,
  UnifiedSearchResult,
} from '../../shared/search-types'
import { buildSearchQueryRequest, getDefaultSearchScope } from './search-request'

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
  memoryTypeFilter: ObservationType | null
  setMemoryTypeFilter: (value: ObservationType | null) => void
  memoryConceptFilter: string | null
  setMemoryConceptFilter: (value: string | null) => void
  results: UnifiedSearchResult[]
  warnings: string[]
  isSearching: boolean
  aiAnswer: SearchAskResponse | null
  isAsking: boolean
  ask: () => Promise<void>
  clearAiAnswer: () => void
  aiError: string | null
  error: string | null
}

export function useSearch(activeProjectId: string | null, activeSessionId: string | null): UseSearchResult {
  const [context, setContext] = useState<SearchContextResponse | null>(null)
  const [mode, setModeState] = useState<SearchMode>('code')
  const [query, setQuery] = useState('')
  const [scopeKind, setScopeKind] = useState<SearchScopeKind>('active-session')
  const [matchMode, setMatchMode] = useState<SearchMatchMode>('literal')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<ObservationType | null>(null)
  const [memoryConceptFilter, setMemoryConceptFilter] = useState<string | null>(null)
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [aiAnswer, setAiAnswer] = useState<SearchAskResponse | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const askRequestIdRef = useRef(0)

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
    setAiAnswer(null)
    setAiError(null)
    setIsAsking(false)
    setQuery('')
    setModeState('code')
    setScopeKind('active-session')
    setMatchMode('literal')
    setCaseSensitive(false)
    setWholeWord(false)
    setMemoryTypeFilter(null)
    setMemoryConceptFilter(null)
  }, [activeProjectId])

  useEffect(() => {
    if (mode === 'memory' && matchMode === 'regex') {
      setMatchMode('literal')
    }
  }, [matchMode, mode])

  const setMode = useCallback((nextMode: SearchMode) => {
    setModeState(nextMode)

    if (nextMode === mode) return
    if (nextMode === 'memory') return
    if (nextMode === 'everything') {
      setScopeKind(getDefaultSearchScope(nextMode, context, activeSessionId))
    }
  }, [activeSessionId, context, mode])

  const effectiveScope = useMemo<SearchScopeDescriptor>(() => {
    if (mode === 'memory') return { kind: 'memory-only' }
    if (mode === 'everything' && scopeKind === 'all-project-sessions') {
      return { kind: scopeKind, includeAdditionalDirs: true }
    }
    return { kind: scopeKind }
  }, [mode, scopeKind])

  const request = useMemo(() => buildSearchQueryRequest({
    activeProjectId,
    activeSessionId,
    mode,
    query,
    scope: effectiveScope,
    matchMode,
    caseSensitive,
    wholeWord,
    memoryTypeFilter,
    memoryConceptFilter,
  }), [
    activeProjectId,
    activeSessionId,
    mode,
    query,
    effectiveScope,
    matchMode,
    caseSensitive,
    wholeWord,
    memoryTypeFilter,
    memoryConceptFilter,
  ])

  const clearAiAnswer = useCallback(() => {
    askRequestIdRef.current += 1
    setAiAnswer(null)
    setAiError(null)
    setIsAsking(false)
  }, [])

  useEffect(() => {
    clearAiAnswer()
  }, [request, clearAiAnswer])

  const search = useCallback(async (): Promise<void> => {
    if (!request) {
      setResults([])
      setWarnings([])
      return
    }

    const requestId = ++requestIdRef.current
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
  }, [request])

  const ask = useCallback(async (): Promise<void> => {
    if (!request) {
      clearAiAnswer()
      return
    }

    const requestId = ++askRequestIdRef.current
    setIsAsking(true)
    setAiError(null)
    try {
      const response = await window.electronAPI.invoke('search:ask', {
        search: request,
        question: request.query,
      }) as SearchAskResponse
      if (requestId !== askRequestIdRef.current) return
      setAiAnswer(response)
    } catch (nextError) {
      if (requestId !== askRequestIdRef.current) return
      setAiAnswer(null)
      setAiError(formatSearchError(nextError))
    } finally {
      if (requestId === askRequestIdRef.current) {
        setIsAsking(false)
      }
    }
  }, [clearAiAnswer, request])

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (!request) {
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
  }, [request, search])

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
    memoryTypeFilter,
    setMemoryTypeFilter,
    memoryConceptFilter,
    setMemoryConceptFilter,
    results,
    warnings,
    isSearching,
    aiAnswer,
    isAsking,
    ask,
    clearAiAnswer,
    aiError,
    error,
  }
}

function formatSearchError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Search failed.'
}
