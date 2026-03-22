import React from 'react'
import type { CodeSearchResult, SearchMatchMode, UnifiedSearchResult } from '../../../shared/search-types'
import { searchPanelStyles as s } from './SearchPanel.styles'
import { splitHighlightedText } from './search-highlight'
import { formatMemoryDate } from './search-panel-utils'

interface SearchResultCardProps {
  result: UnifiedSearchResult
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  onOpenCodeResult: (result: CodeSearchResult) => void
}

export function SearchResultCard({
  result,
  query,
  matchMode,
  caseSensitive,
  wholeWord,
  onOpenCodeResult,
}: SearchResultCardProps): React.JSX.Element {
  const isCode = result.source === 'code'
  const content = (
    <>
      <div style={s.resultHeader}>
        <span style={s.resultTitle}>{result.title}</span>
        <span style={{ ...s.badge, ...(isCode ? s.codeBadge : {}) }}>{isCode ? 'Code' : 'Memory'}</span>
        {!isCode && <span style={s.badge}>{result.memorySource}</span>}
      </div>
      {isCode ? (
        <CodeSnippet
          result={result}
          query={query}
          matchMode={matchMode}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
        />
      ) : (
        <div style={s.resultSnippet}>
          <HighlightedText
            text={result.snippet}
            query={query}
            matchMode={matchMode}
            caseSensitive={caseSensitive}
            wholeWord={wholeWord}
          />
        </div>
      )}
      <div style={s.resultMeta}>
        {isCode ? (
          <>
            <span>{result.relativePath}</span>
            <span>Ln {result.line}</span>
            {result.branchName && <span>{result.branchName}</span>}
            {result.runtimeId && <span>{result.runtimeId}</span>}
          </>
        ) : (
          <>
            {result.branchName && <span>{result.branchName}</span>}
            {result.runtimeId && <span>{result.runtimeId}</span>}
            <span>{formatMemoryDate(result.createdAt)}</span>
          </>
        )}
      </div>
    </>
  )

  if (isCode) {
    return (
      <button
        type="button"
        style={{ ...s.resultCard, ...s.resultCardButton, ...s.resultCardClickable }}
        onClick={() => onOpenCodeResult(result)}
        aria-label={`Open ${result.relativePath} line ${result.line}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div style={{ ...s.resultCard, ...s.resultCardStatic }}>
      {content}
    </div>
  )
}

function CodeSnippet({
  result,
  query,
  matchMode,
  caseSensitive,
  wholeWord,
}: {
  result: CodeSearchResult
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
}): React.JSX.Element {
  const beforeLines = result.contextBefore ?? []
  const afterLines = result.contextAfter ?? []

  return (
    <div style={s.resultCodeBlock}>
      {beforeLines.map((line, index) => (
        <CodeSnippetLine
          key={`before-${result.id}-${result.line - beforeLines.length + index}`}
          lineNumber={result.line - beforeLines.length + index}
          text={line}
          query={query}
          matchMode={matchMode}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
        />
      ))}
      <CodeSnippetLine
        lineNumber={result.line}
        text={result.snippet}
        query={query}
        matchMode={matchMode}
        caseSensitive={caseSensitive}
        wholeWord={wholeWord}
        current
      />
      {afterLines.map((line, index) => (
        <CodeSnippetLine
          key={`after-${result.id}-${result.line + index + 1}`}
          lineNumber={result.line + index + 1}
          text={line}
          query={query}
          matchMode={matchMode}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
        />
      ))}
    </div>
  )
}

function CodeSnippetLine({
  lineNumber,
  text,
  query,
  matchMode,
  caseSensitive,
  wholeWord,
  current = false,
}: {
  lineNumber: number
  text: string
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  current?: boolean
}): React.JSX.Element {
  return (
    <div style={{ ...s.resultCodeLine, ...(current ? s.resultCodeLineCurrent : {}) }}>
      <span style={s.resultCodeLineNumber}>{lineNumber}</span>
      <span style={s.resultCodeLineText}>
        <HighlightedText
          text={text}
          query={query}
          matchMode={matchMode}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
        />
      </span>
    </div>
  )
}

function HighlightedText({
  text,
  query,
  matchMode,
  caseSensitive,
  wholeWord,
}: {
  text: string
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
}): React.JSX.Element {
  const segments = splitHighlightedText(text, {
    query,
    matchMode,
    caseSensitive,
    wholeWord,
  })

  return (
    <>
      {segments.map((segment, index) => (
        segment.match ? (
          <mark key={`${segment.text}-${index}`} style={s.matchHighlight}>{segment.text}</mark>
        ) : (
          <React.Fragment key={`${segment.text}-${index}`}>{segment.text}</React.Fragment>
        )
      ))}
    </>
  )
}
