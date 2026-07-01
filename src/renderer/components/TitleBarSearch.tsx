import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSession } from '../../shared/types'
import type { CodeSearchResult, MemorySearchResultItem, SearchMode, UnifiedSearchResult } from '../../shared/search-types'
import { useSearch } from '../hooks/search/useSearch'
import { highlightByIndices, splitHighlightedText, type HighlightSegment } from './search/search-highlight'
import { FileGlyph, MemoryGlyph, SearchGlyph } from './search/search-glyphs'
import { titleBarSearchStyles as styles } from './TitleBarSearch.styles'

export interface TitleBarSearchWiring {
  activeProjectId: string | null
  activeSessionId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
  /** Bumps when something (Cmd+Shift+F, the Memory panel) requests focus. */
  focusRequestKey: number
  /** Scope to switch to when focus is requested. */
  requestedMode: SearchMode | null
}

const SCOPES: { label: string; mode: SearchMode }[] = [
  { label: 'Everything', mode: 'everything' },
  { label: 'Code', mode: 'code' },
  { label: 'Files', mode: 'files' },
  { label: 'Memory', mode: 'memory' },
]

function memoryMetaFor(result: MemorySearchResultItem): string {
  return `memory · ${result.memorySource.replace(/_/g, ' ')}`
}

export function TitleBarSearch({ search: wiring }: { search: TitleBarSearchWiring }): React.JSX.Element {
  const search = useSearch(wiring.activeProjectId, wiring.activeSessionId, wiring.allProjectSessions)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const handledFocusRequestKeyRef = useRef(0)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Focus the input when an external trigger (Cmd+Shift+F, the Memory panel's
  // "Open Search") bumps the request key, switching scope if one was asked for.
  useEffect(() => {
    if (wiring.focusRequestKey <= handledFocusRequestKeyRef.current) return
    handledFocusRequestKeyRef.current = wiring.focusRequestKey
    if (wiring.requestedMode) search.setMode(wiring.requestedMode)
    setFocused(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [wiring.focusRequestKey, wiring.requestedMode, search.setMode])

  const fileResults = useMemo(() => search.results.filter((r) => r.source === 'file'), [search.results])
  const codeResults = useMemo(() => search.results.filter((r) => r.source === 'code'), [search.results])
  const memoryResults = useMemo(() => search.results.filter((r) => r.source === 'memory'), [search.results])
  const ordered = useMemo(() => [...fileResults, ...codeResults, ...memoryResults], [fileResults, codeResults, memoryResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [search.results])

  const trimmedQuery = search.query.trim()

  const openResult = (result: UnifiedSearchResult | undefined): void => {
    // Memory results aren't openable as files (mirrors the dock SearchPanel) — Enter/click is a no-op.
    if (!result || (result.source !== 'code' && result.source !== 'file')) return
    wiring.onOpenSearchResult({
      path: result.filePath,
      line: result.source === 'code' ? result.line : undefined,
      column: result.source === 'code' ? result.column : undefined,
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

  const renderSegments = (segments: HighlightSegment[]): React.ReactNode =>
    segments.map((segment, index) =>
      segment.match
        ? <mark key={index} style={styles.mark}>{segment.text}</mark>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>,
    )

  const renderHighlighted = (text: string): React.ReactNode => renderSegments(splitHighlightedText(text, {
    query: search.query,
    matchMode: search.matchMode,
    caseSensitive: search.caseSensitive,
    wholeWord: search.wholeWord,
  }))

  const renderCodeLine = (lineNumber: number, text: string, current: boolean): React.JSX.Element => (
    <div key={lineNumber} style={{ ...styles.codeLine, ...(current ? styles.codeLineCurrent : undefined) }}>
      <span style={styles.codeLineNumber}>{lineNumber}</span>
      <span style={styles.codeLineText}>{renderHighlighted(text)}</span>
    </div>
  )

  const renderCodePreview = (result: CodeSearchResult): React.JSX.Element => {
    const before = result.contextBefore ?? []
    const after = result.contextAfter ?? []
    const firstLine = result.line - before.length
    return (
      <div style={styles.code}>
        {before.map((text, i) => renderCodeLine(firstLine + i, text, false))}
        {renderCodeLine(result.line, result.snippet, true)}
        {after.map((text, i) => renderCodeLine(result.line + i + 1, text, false))}
      </div>
    )
  }

  const resultIcon = (result: UnifiedSearchResult): React.JSX.Element => {
    if (result.source === 'file') return <FileGlyph />
    if (result.source === 'code') return <SearchGlyph />
    return <MemoryGlyph />
  }

  const renderResultTitle = (result: UnifiedSearchResult): React.ReactNode => {
    if (result.source === 'file') return renderSegments(highlightByIndices(result.title, result.matchedIndices))
    if (result.source === 'code') return result.title
    return renderHighlighted(result.title)
  }

  const renderResult = (result: UnifiedSearchResult, index: number): React.JSX.Element => (
    <div
      key={result.id}
      style={{ ...styles.result, ...(result.source === 'code' ? styles.resultCode : undefined), ...(index === activeIndex ? styles.resultActive : undefined) }}
      onMouseEnter={() => setActiveIndex(index)}
      onMouseDown={(event) => {
        event.preventDefault()
        openResult(result)
      }}
    >
      <span style={styles.resultIcon}>{resultIcon(result)}</span>
      <div style={styles.resultBody}>
        <div style={styles.resultTitle}>{renderResultTitle(result)}</div>
        {result.source === 'code' && renderCodePreview(result)}
        {result.source === 'memory' && <div style={styles.resultMeta}>{memoryMetaFor(result)}</div>}
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
          placeholder="Search files, code &amp; memory…"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search files, code and memory"
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
              <div style={styles.empty}>Type to search files, code and memory.</div>
            ) : search.isSearching && ordered.length === 0 ? (
              <div style={styles.empty}>Searching…</div>
            ) : ordered.length === 0 ? (
              <div style={styles.empty}>No matches for &ldquo;{trimmedQuery}&rdquo;.</div>
            ) : (
              <>
                {fileResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Files</div>
                    {fileResults.map((result, i) => renderResult(result, i))}
                  </div>
                )}
                {codeResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Code</div>
                    {codeResults.map((result, i) => renderResult(result, fileResults.length + i))}
                  </div>
                )}
                {memoryResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Memory</div>
                    {memoryResults.map((result, i) => renderResult(result, fileResults.length + codeResults.length + i))}
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
