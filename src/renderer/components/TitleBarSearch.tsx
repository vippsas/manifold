import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSession } from '../../shared/types'
import type { SearchMode, UnifiedSearchResult } from '../../shared/search-types'
import { useSearch } from '../hooks/useSearch'
import { splitHighlightedText } from './search/search-highlight'
import { titleBarSearchStyles as styles } from './TitleBarSearch.styles'

export interface TitleBarSearchWiring {
  activeProjectId: string | null
  activeSessionId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
}

const SCOPES: { label: string; mode: SearchMode }[] = [
  { label: 'Everything', mode: 'everything' },
  { label: 'Code', mode: 'code' },
  { label: 'Memory', mode: 'memory' },
]

function SearchGlyph({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx={11} cy={11} r={7} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  )
}

function MemoryGlyph({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={4} width={16} height={16} rx={2} />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  )
}

function metaFor(result: UnifiedSearchResult): string {
  if (result.source === 'code') return `${result.relativePath}:${result.line}`
  return `memory · ${result.memorySource.replace(/_/g, ' ')}`
}

export function TitleBarSearch({ search: wiring }: { search: TitleBarSearchWiring }): React.JSX.Element {
  const search = useSearch(wiring.activeProjectId, wiring.activeSessionId, wiring.allProjectSessions)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const codeResults = useMemo(() => search.results.filter((r) => r.source === 'code'), [search.results])
  const memoryResults = useMemo(() => search.results.filter((r) => r.source === 'memory'), [search.results])
  const ordered = useMemo(() => [...codeResults, ...memoryResults], [codeResults, memoryResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [search.results])

  const trimmedQuery = search.query.trim()

  const openResult = (result: UnifiedSearchResult | undefined): void => {
    if (!result || result.source !== 'code') return
    wiring.onOpenSearchResult({
      path: result.filePath,
      line: result.line,
      column: result.column,
      sessionId: result.sessionId,
    })
    setFocused(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setFocused(false)
      inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, ordered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openResult(ordered[activeIndex])
    }
  }

  const renderTitle = (text: string): React.ReactNode => {
    const segments = splitHighlightedText(text, {
      query: search.query,
      matchMode: search.matchMode,
      caseSensitive: search.caseSensitive,
      wholeWord: search.wholeWord,
    })
    return segments.map((segment, index) =>
      segment.match
        ? <mark key={index} style={styles.mark}>{segment.text}</mark>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>,
    )
  }

  const renderResult = (result: UnifiedSearchResult, index: number): React.JSX.Element => (
    <div
      key={result.id}
      style={{ ...styles.result, ...(index === activeIndex ? styles.resultActive : undefined) }}
      onMouseEnter={() => setActiveIndex(index)}
      onMouseDown={(event) => {
        event.preventDefault()
        openResult(result)
      }}
    >
      <span style={styles.resultIcon}>{result.source === 'memory' ? <MemoryGlyph /> : <SearchGlyph />}</span>
      <div style={styles.resultBody}>
        <div style={styles.resultTitle}>{renderTitle(result.title)}</div>
        <div style={styles.resultMeta}>{metaFor(result)}</div>
      </div>
    </div>
  )

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <div style={{ ...styles.field, ...(focused ? styles.fieldFocused : undefined) }}>
        <span style={styles.iconWrap}><SearchGlyph size={14} /></span>
        <input
          ref={inputRef}
          className="titlebar-search-input"
          style={styles.input}
          placeholder="Search code &amp; memory…"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search code and memory"
        />
        {search.query && (
          <button
            style={styles.clearBtn}
            aria-label="Clear search"
            onMouseDown={(event) => {
              event.preventDefault()
              search.setQuery('')
            }}
          >
            ✕
          </button>
        )}
      </div>

      {focused && (
        <div style={styles.dropdown}>
          <div style={styles.scopes}>
            {SCOPES.map((option) => (
              <button
                key={option.mode}
                style={{ ...styles.scope, ...(search.mode === option.mode ? styles.scopeActive : undefined) }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  search.setMode(option.mode)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div style={styles.results}>
            {search.error ? (
              <div style={styles.errorText}>{search.error}</div>
            ) : !trimmedQuery ? (
              <div style={styles.empty}>Type to search code and memory.</div>
            ) : search.isSearching && ordered.length === 0 ? (
              <div style={styles.empty}>Searching…</div>
            ) : ordered.length === 0 ? (
              <div style={styles.empty}>No matches for &ldquo;{trimmedQuery}&rdquo;.</div>
            ) : (
              <>
                {codeResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Code</div>
                    {codeResults.map((result) => renderResult(result, ordered.indexOf(result)))}
                  </div>
                )}
                {memoryResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Memory</div>
                    {memoryResults.map((result) => renderResult(result, ordered.indexOf(result)))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={styles.footer}>
            <span><span style={styles.fkbd}>↑↓</span>navigate</span>
            <span><span style={styles.fkbd}>⏎</span>open</span>
          </div>
        </div>
      )}
    </div>
  )
}
