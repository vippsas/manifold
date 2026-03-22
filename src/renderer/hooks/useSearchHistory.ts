import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProjectSearchViewState, SearchHistoryEntry, SearchViewSnapshot, SavedSearchEntry } from '../../shared/search-view-state'
import type { ObservationType } from '../../shared/memory-types'
import type { SearchMatchMode, SearchMode, SearchScopeKind } from '../../shared/search-types'

const EMPTY_STATE: ProjectSearchViewState = { recent: [], saved: [] }
const MAX_RECENT = 8
const MAX_SAVED = 10

interface SearchHistoryController {
  mode: SearchMode
  setMode: (mode: SearchMode) => void
  query: string
  setQuery: (query: string) => void
  scopeKind: SearchScopeKind
  setScopeKind: (scopeKind: SearchScopeKind) => void
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
}

export interface UseSearchHistoryResult {
  savedSearches: SavedSearchEntry[]
  recentSearches: SearchHistoryEntry[]
  currentSavedSearchId: string | null
  toggleSaveCurrentSearch: () => Promise<void>
  applySearchEntry: (entry: SearchHistoryEntry | SavedSearchEntry) => Promise<void>
  markCurrentSearchUsed: (resultCount?: number) => Promise<void>
}

export function useSearchHistory(
  activeProjectId: string | null,
  controller: SearchHistoryController,
): UseSearchHistoryResult {
  const [viewState, setViewState] = useState<ProjectSearchViewState>(EMPTY_STATE)

  useEffect(() => {
    if (!activeProjectId) {
      setViewState(EMPTY_STATE)
      return
    }

    let cancelled = false
    void (async (): Promise<void> => {
      const nextState = await window.electronAPI.invoke('search:view-state:get', activeProjectId) as ProjectSearchViewState | null
      if (!cancelled) {
        setViewState(nextState ?? EMPTY_STATE)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  const currentSnapshot = useMemo(
    () => createSnapshot(controller),
    [
      controller.caseSensitive,
      controller.matchMode,
      controller.memoryConceptFilter,
      controller.memoryTypeFilter,
      controller.mode,
      controller.query,
      controller.scopeKind,
      controller.wholeWord,
    ],
  )

  const persistState = useCallback(async (nextState: ProjectSearchViewState): Promise<void> => {
    setViewState(nextState)
    if (!activeProjectId) return
    await window.electronAPI.invoke('search:view-state:set', activeProjectId, nextState)
  }, [activeProjectId])

  const currentSavedSearchId = useMemo(() => {
    if (!currentSnapshot) return null
    return viewState.saved.find((entry) => snapshotsEqual(entry.snapshot, currentSnapshot))?.id ?? null
  }, [currentSnapshot, viewState.saved])

  const applySnapshot = useCallback((snapshot: SearchViewSnapshot): void => {
    controller.setMode(snapshot.mode)
    controller.setScopeKind(snapshot.scopeKind)
    controller.setMatchMode(snapshot.matchMode)
    controller.setCaseSensitive(snapshot.caseSensitive)
    controller.setWholeWord(snapshot.wholeWord)
    controller.setMemoryTypeFilter(snapshot.memoryTypeFilter)
    controller.setMemoryConceptFilter(snapshot.memoryConceptFilter)
    controller.setQuery(snapshot.query)
  }, [controller])

  const toggleSaveCurrentSearch = useCallback(async (): Promise<void> => {
    if (!currentSnapshot) return

    const existing = viewState.saved.find((entry) => snapshotsEqual(entry.snapshot, currentSnapshot))
    if (existing) {
      await persistState({
        ...viewState,
        saved: viewState.saved.filter((entry) => entry.id !== existing.id),
      })
      return
    }

    const now = Date.now()
    const nextSavedEntry: SavedSearchEntry = {
      id: `saved-${now}`,
      label: currentSnapshot.query,
      snapshot: currentSnapshot,
      savedAt: now,
      usedAt: now,
    }

    await persistState({
      recent: viewState.recent,
      saved: [nextSavedEntry, ...viewState.saved].slice(0, MAX_SAVED),
    })
  }, [currentSnapshot, persistState, viewState])

  const applySearchEntry = useCallback(async (entry: SearchHistoryEntry | SavedSearchEntry): Promise<void> => {
    applySnapshot(entry.snapshot)
    await persistState(withRecentSearch(viewState, entry.snapshot, entry.resultCount))
  }, [applySnapshot, persistState, viewState])

  const markCurrentSearchUsed = useCallback(async (resultCount?: number): Promise<void> => {
    if (!currentSnapshot) return
    await persistState(withRecentSearch(viewState, currentSnapshot, resultCount))
  }, [currentSnapshot, persistState, viewState])

  return {
    savedSearches: viewState.saved,
    recentSearches: viewState.recent,
    currentSavedSearchId,
    toggleSaveCurrentSearch,
    applySearchEntry,
    markCurrentSearchUsed,
  }
}

function createSnapshot(controller: SearchHistoryController): SearchViewSnapshot | null {
  const query = controller.query.trim()
  if (!query) return null

  return {
    mode: controller.mode,
    query,
    scopeKind: controller.scopeKind,
    matchMode: controller.matchMode,
    caseSensitive: controller.caseSensitive,
    wholeWord: controller.wholeWord,
    memoryTypeFilter: controller.memoryTypeFilter,
    memoryConceptFilter: controller.memoryConceptFilter,
  }
}

function withRecentSearch(
  viewState: ProjectSearchViewState,
  snapshot: SearchViewSnapshot,
  resultCount?: number,
): ProjectSearchViewState {
  const now = Date.now()
  const existingSaved = viewState.saved.find((entry) => snapshotsEqual(entry.snapshot, snapshot))
  const saved = viewState.saved.map((entry) => (
    entry.id === existingSaved?.id
      ? { ...entry, usedAt: now, resultCount: resultCount ?? entry.resultCount }
      : entry
  ))

  const recentEntry: SearchHistoryEntry = {
    id: existingSaved?.id ?? `recent-${now}`,
    label: snapshot.query,
    snapshot,
    usedAt: now,
    resultCount,
  }

  const recent = [
    recentEntry,
    ...viewState.recent.filter((entry) => !snapshotsEqual(entry.snapshot, snapshot)),
  ].slice(0, MAX_RECENT)

  return { recent, saved }
}

function snapshotsEqual(left: SearchViewSnapshot, right: SearchViewSnapshot): boolean {
  return (
    left.mode === right.mode &&
    left.query === right.query &&
    left.scopeKind === right.scopeKind &&
    left.matchMode === right.matchMode &&
    left.caseSensitive === right.caseSensitive &&
    left.wholeWord === right.wholeWord &&
    left.memoryTypeFilter === right.memoryTypeFilter &&
    left.memoryConceptFilter === right.memoryConceptFilter
  )
}
