import React, { useEffect, useMemo, useRef } from 'react'
import type { SearchScopeKind, UnifiedSearchResult } from '../../../shared/search-types'
import { useSearch } from '../../hooks/useSearch'
import { useSearchHistory } from '../../hooks/useSearchHistory'
import { useDockState } from '../editor/dock-panel-types'
import { searchPanelStyles as s } from './SearchPanel.styles'
import { AiAnswerPanel } from './AiAnswerPanel'
import { SearchPanelControls } from './SearchPanelControls'
import { EverythingSearchView } from './EverythingSearchView'
import { SavedSearchView } from './SavedSearchView'
import { SearchResultCard } from './SearchResultCard'
import { SearchMemoryFilters } from './filters/SearchMemoryFilters'
import { useSearchResultSelection } from './useSearchResultSelection'
import {
  getActiveContextSession,
  getEmptyState,
  getInfoText,
  getScopeOptions,
  getSearchPlaceholder,
} from './search-panel-utils'

export function SearchPanel(): React.JSX.Element {
  const dock = useDockState()
  const search = useSearch(dock.activeProjectId, dock.sessionId)
  const history = useSearchHistory(dock.activeProjectId, search)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const handledFocusRequestKeyRef = useRef(0)
  const activeContextSession = useMemo(
    () => getActiveContextSession(search.context, dock.sessionId),
    [dock.sessionId, search.context],
  )
  const {
    selectedResultId,
    setSelectedResultId,
    selectedResult,
    moveSelection,
  } = useSearchResultSelection(search.results)
  const hasCurrentSearch = search.query.trim().length > 0
  const showLandingState = !hasCurrentSearch && !search.isSearching && !search.aiAnswer && !search.aiError
  const hasCodeResults = search.results.some((result) => result.source === 'code')

  useEffect(() => {
    if (dock.searchFocusRequestKey <= handledFocusRequestKeyRef.current) return

    handledFocusRequestKeyRef.current = dock.searchFocusRequestKey
    if (dock.requestedSearchMode) {
      search.setMode(dock.requestedSearchMode)
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [dock.requestedSearchMode, dock.searchFocusRequestKey, search.setMode])

  const scopeOptions = useMemo(
    () => getScopeOptions(
      search.context?.sessions.length ?? 0,
      activeContextSession?.additionalDirs.length ?? 0,
    ),
    [activeContextSession?.additionalDirs.length, search.context?.sessions.length],
  )

  useEffect(() => {
    if (search.mode === 'memory') return
    if (scopeOptions.some((option) => option.value === search.scopeKind)) return
    search.setScopeKind('active-session')
  }, [scopeOptions, search.mode, search.scopeKind, search.setScopeKind])

  const infoText = useMemo(
    () => getInfoText({
      context: search.context,
      mode: search.mode,
      scopeKind: search.scopeKind,
      additionalDirCount: activeContextSession?.additionalDirs.length ?? 0,
      totalAdditionalDirCount: search.context?.sessions.reduce(
        (count, session) => count + session.additionalDirs.length,
        0,
      ) ?? 0,
      hasActiveSession: activeContextSession !== null,
    }),
    [activeContextSession, search.context, search.mode, search.scopeKind],
  )
  const resultSummary = useMemo(() => {
    if (search.isSearching) return 'Searching...'
    if (!hasCurrentSearch) return null
    if (search.results.length === 0) return 'No results'
    return `${search.results.length} ${search.results.length === 1 ? 'result' : 'results'}`
  }, [hasCurrentSearch, search.isSearching, search.results.length])

  if (!dock.activeProjectId) {
    return <div style={s.empty}>Select a project to search</div>
  }

  const openCodeResult = (filePath: string, line: number, column: number | undefined, sessionId?: string): void => {
    void history.markCurrentSearchUsed(search.results.length)
    dock.onOpenSearchResult({
      path: filePath,
      line,
      column,
      sessionId,
    })
  }

  const openCodeResultInSplit = (filePath: string, line: number, column: number | undefined, sessionId?: string): void => {
    void history.markCurrentSearchUsed(search.results.length)
    dock.onOpenSearchResultInSplit({
      path: filePath,
      line,
      column,
      sessionId,
    })
  }

  const openResult = (result: UnifiedSearchResult | null, inSplit = false): void => {
    if (!result || result.source !== 'code') return
    if (inSplit) {
      openCodeResultInSplit(result.filePath, result.line, result.column, result.sessionId)
      return
    }
    openCodeResult(result.filePath, result.line, result.column, result.sessionId)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (selectedResult?.source === 'code') {
        openResult(selectedResult, event.altKey || event.metaKey)
        return
      }
      void history.markCurrentSearchUsed(search.results.length)
    }
  }

  return (
    <div style={s.wrapper}>
      <SearchPanelControls
        mode={search.mode}
        query={search.query}
        scopeKind={search.scopeKind}
        matchMode={search.matchMode}
        caseSensitive={search.caseSensitive}
        wholeWord={search.wholeWord}
        scopeOptions={scopeOptions}
        inputRef={inputRef}
        placeholder={getSearchPlaceholder(search.mode)}
        canAskAi={search.canAskAi && hasCurrentSearch}
        isAsking={search.isAsking}
        canSaveCurrent={hasCurrentSearch}
        isCurrentSaved={history.currentSavedSearchId !== null}
        showClearAnswer={Boolean(search.aiAnswer || search.aiError)}
        onInputKeyDown={handleInputKeyDown}
        onModeChange={search.setMode}
        onQueryChange={search.setQuery}
        onScopeChange={(scope) => search.setScopeKind(scope as SearchScopeKind)}
        onToggleMatchMode={() => search.setMatchMode(search.matchMode === 'literal' ? 'regex' : 'literal')}
        onToggleCaseSensitive={() => search.setCaseSensitive(!search.caseSensitive)}
        onToggleWholeWord={() => search.setWholeWord(!search.wholeWord)}
        onAskAi={() => {
          void history.markCurrentSearchUsed(search.results.length)
          void search.ask()
        }}
        onToggleSaveCurrent={() => void history.toggleSaveCurrentSearch()}
        onClearAnswer={search.clearAiAnswer}
      />

      {search.mode === 'memory' && (
        <SearchMemoryFilters
          typeFilter={search.memoryTypeFilter}
          conceptFilter={search.memoryConceptFilter}
          onToggleType={(type) => search.setMemoryTypeFilter(search.memoryTypeFilter === type ? null : type)}
          onToggleConcept={(concept) => search.setMemoryConceptFilter(search.memoryConceptFilter === concept ? null : concept)}
        />
      )}

      {(infoText || search.warnings.length > 0 || search.error) && (
        <div style={s.infoBar}>
          {infoText && <span>{infoText}</span>}
          {search.warnings.map((warning) => (
            <span key={warning} style={s.warning}>{warning}</span>
          ))}
          {search.error && <span style={s.error}>{search.error}</span>}
        </div>
      )}

      {(resultSummary || hasCodeResults) && (
        <div style={s.summaryBar}>
          {resultSummary && <span style={s.summaryText}>{resultSummary}</span>}
          {hasCodeResults && (
            <span style={s.summaryHint}>
              {selectedResult?.source === 'code'
                ? 'Enter opens the selected result. Alt+Enter opens in split.'
                : 'Arrow keys select results. Enter opens files. Alt+Enter opens in split.'}
            </span>
          )}
        </div>
      )}

      <div style={s.content}>
        {showLandingState ? (
          <>
            <div style={s.emptyStatePanel}>
              <div style={s.emptyStateTitle}>Search the project</div>
              <div style={s.emptyStateBody}>{getEmptyState(search.mode)}</div>
            </div>
            <SavedSearchView
              savedSearches={history.savedSearches}
              recentSearches={history.recentSearches}
              currentSavedSearchId={history.currentSavedSearchId}
              onApplyEntry={(entry) => void history.applySearchEntry(entry)}
            />
          </>
        ) : (
          <>
            <AiAnswerPanel
              query={search.query}
              response={search.aiAnswer}
              isAsking={search.isAsking}
              error={search.aiError}
              matchMode={search.matchMode}
              caseSensitive={search.caseSensitive}
              wholeWord={search.wholeWord}
              onOpenCodeResult={(codeResult) => openCodeResult(
                codeResult.filePath,
                codeResult.line,
                codeResult.column,
                codeResult.sessionId,
              )}
            />

            {search.isSearching ? (
              <div style={s.empty}>Searching...</div>
            ) : search.results.length > 0 ? (
              search.mode === 'everything' ? (
                <EverythingSearchView
                  results={search.results}
                  query={search.query}
                  matchMode={search.matchMode}
                  caseSensitive={search.caseSensitive}
                  wholeWord={search.wholeWord}
                  selectedResultId={selectedResultId}
                  onSelectResult={setSelectedResultId}
                  onOpenCodeResult={(codeResult) => openCodeResult(
                    codeResult.filePath,
                    codeResult.line,
                    codeResult.column,
                    codeResult.sessionId,
                  )}
                />
              ) : (
                search.results.map((result) => (
                  <SearchResultCard
                    key={result.id}
                    result={result}
                    query={search.query}
                    matchMode={search.matchMode}
                    caseSensitive={search.caseSensitive}
                    wholeWord={search.wholeWord}
                    selected={selectedResultId === result.id}
                    onSelect={() => setSelectedResultId(result.id)}
                    onOpenCodeResult={(codeResult) => openCodeResult(
                      codeResult.filePath,
                      codeResult.line,
                      codeResult.column,
                      codeResult.sessionId,
                    )}
                  />
                ))
              )
            ) : (
              <div style={s.empty}>No results found</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
