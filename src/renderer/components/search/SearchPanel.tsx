import React, { useEffect, useMemo, useRef } from 'react'
import type { SearchScopeKind } from '../../../shared/search-types'
import { useSearch } from '../../hooks/useSearch'
import { useDockState } from '../editor/dock-panel-types'
import { searchPanelStyles as s } from './SearchPanel.styles'
import { SearchPanelControls } from './SearchPanelControls'
import { SearchResultCard } from './SearchResultCard'
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const activeContextSession = useMemo(
    () => getActiveContextSession(search.context, dock.sessionId),
    [dock.sessionId, search.context],
  )

  useEffect(() => {
    if (dock.searchFocusRequestKey > 0) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [dock.searchFocusRequestKey])

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
      hasActiveSession: activeContextSession !== null,
    }),
    [activeContextSession, search.context, search.mode, search.scopeKind],
  )

  if (!dock.activeProjectId) {
    return <div style={s.empty}>Select a project to search</div>
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
        onModeChange={search.setMode}
        onQueryChange={search.setQuery}
        onScopeChange={(scope) => search.setScopeKind(scope as SearchScopeKind)}
        onToggleMatchMode={() => search.setMatchMode(search.matchMode === 'literal' ? 'regex' : 'literal')}
        onToggleCaseSensitive={() => search.setCaseSensitive(!search.caseSensitive)}
        onToggleWholeWord={() => search.setWholeWord(!search.wholeWord)}
      />

      {(infoText || search.warnings.length > 0 || search.error) && (
        <div style={s.infoBar}>
          {infoText && <span>{infoText}</span>}
          {search.warnings.map((warning) => (
            <span key={warning} style={s.warning}>{warning}</span>
          ))}
          {search.error && <span style={s.error}>{search.error}</span>}
        </div>
      )}

      <div style={s.content}>
        {search.isSearching ? (
          <div style={s.empty}>Searching...</div>
        ) : search.results.length > 0 ? (
          search.results.map((result) => (
            <SearchResultCard
              key={result.id}
              result={result}
              query={search.query}
              matchMode={search.matchMode}
              caseSensitive={search.caseSensitive}
              wholeWord={search.wholeWord}
              onOpenCodeResult={(codeResult) => dock.onOpenSearchResult({
                path: codeResult.filePath,
                line: codeResult.line,
                column: codeResult.column,
                sessionId: codeResult.sessionId,
              })}
            />
          ))
        ) : search.query.trim() ? (
          <div style={s.empty}>No results found</div>
        ) : (
          <div style={s.empty}>{getEmptyState(search.mode)}</div>
        )}
      </div>
    </div>
  )
}
