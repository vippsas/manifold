import React, { useMemo } from 'react'
import type { CodeSearchResult, SearchMatchMode, UnifiedSearchResult } from '../../../shared/search-types'
import { searchPanelStyles as s } from './SearchPanel.styles'
import { SearchResultCard } from './SearchResultCard'

interface EverythingSearchViewProps {
  results: UnifiedSearchResult[]
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  selectedResultId: string | null
  onSelectResult: (resultId: string) => void
  onOpenCodeResult: (result: CodeSearchResult) => void
}

export function EverythingSearchView(props: EverythingSearchViewProps): React.JSX.Element {
  const { codeResults, memoryResults } = useMemo(() => ({
    codeResults: props.results.filter((result): result is CodeSearchResult => result.source === 'code'),
    memoryResults: props.results.filter((result) => result.source === 'memory'),
  }), [props.results])

  return (
    <>
      <SearchResultSection
        title="Code"
        results={codeResults}
        query={props.query}
        matchMode={props.matchMode}
        caseSensitive={props.caseSensitive}
        wholeWord={props.wholeWord}
        selectedResultId={props.selectedResultId}
        onSelectResult={props.onSelectResult}
        onOpenCodeResult={props.onOpenCodeResult}
      />
      <SearchResultSection
        title="Memory"
        results={memoryResults}
        query={props.query}
        matchMode={props.matchMode}
        caseSensitive={props.caseSensitive}
        wholeWord={props.wholeWord}
        selectedResultId={props.selectedResultId}
        onSelectResult={props.onSelectResult}
        onOpenCodeResult={props.onOpenCodeResult}
      />
    </>
  )
}

function SearchResultSection({
  title,
  results,
  query,
  matchMode,
  caseSensitive,
  wholeWord,
  selectedResultId,
  onSelectResult,
  onOpenCodeResult,
}: {
  title: string
  results: UnifiedSearchResult[]
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  selectedResultId: string | null
  onSelectResult: (resultId: string) => void
  onOpenCodeResult: (result: CodeSearchResult) => void
}): React.JSX.Element | null {
  if (results.length === 0) return null

  return (
    <section style={s.section}>
      <div style={s.sectionHeader}>
        <span style={s.sectionTitle}>{title}</span>
        <span style={s.sectionCount}>{results.length}</span>
      </div>
      {results.map((result) => (
        <SearchResultCard
          key={result.id}
          result={result}
          query={query}
          matchMode={matchMode}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
          selected={selectedResultId === result.id}
          onSelect={() => onSelectResult(result.id)}
          onOpenCodeResult={onOpenCodeResult}
        />
      ))}
    </section>
  )
}
