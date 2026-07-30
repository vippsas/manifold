import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { CodeSearchResult, MemorySearchResultItem, SearchMode, UnifiedSearchResult } from '../../../shared/search-types'
import { useSearch } from '../../hooks/search/useSearch'
import { highlightByIndices, splitHighlightedText, type HighlightSegment } from './search-highlight'
import { FileGlyph, MemoryGlyph, SearchGlyph } from './search-glyphs'
import { searchModalStyles as styles } from './SearchModal.styles'

export interface SearchModalProps {
  visible: boolean
  onClose: () => void
  activeProjectId: string | null
  activeSessionId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
  /** Scope to preselect — the Memory panel's "Open Search" asks for Memory. */
  requestedMode?: SearchMode | null
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

/** Mounts the search UI only while open, so a closed modal costs no
 *  `search:context` IPC and each open starts from a clean query. */
export function SearchModal(props: SearchModalProps): React.JSX.Element | null {
  if (!props.visible) return null
  return <SearchModalBody {...props} />
}

function SearchModalBody({
  onClose,
  activeProjectId,
  activeSessionId,
  allProjectSessions,
  onOpenSearchResult,
  requestedMode,
}: SearchModalProps): React.JSX.Element {
  const search = useSearch(activeProjectId, activeSessionId, allProjectSessions)
  const [activeIndex, setActiveIndex] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const appliedRequestedModeRef = useRef(false)

  // Apply the requested scope once per open; later chip clicks must stick.
  useEffect(() => {
    if (appliedRequestedModeRef.current || !requestedMode) return
    appliedRequestedModeRef.current = true
    search.setMode(requestedMode)
  }, [requestedMode, search.setMode])

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
    onOpenSearchResult({
      path: result.filePath,
      line: result.source === 'code' ? result.line : undefined,
      column: result.source === 'code' ? result.column : undefined,
      sessionId: result.sessionId,
    })
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      onClose()
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
    <div
      ref={overlayRef}
      style={styles.overlay}
      onMouseDown={(event) => { if (event.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div style={styles.panel}>
        <div style={styles.field}>
          <span style={styles.iconWrap}><SearchGlyph size={16} /></span>
          <input
            ref={inputRef}
            className="search-modal-input"
            style={styles.input}
            placeholder="Search files, code &amp; memory…"
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search files, code and memory"
            autoComplete="off"
            autoFocus
          />
          {search.query && (
            <button
              style={styles.clearBtn}
              aria-label="Clear search"
              onMouseDown={(event) => {
                event.preventDefault()
                search.setQuery('')
                inputRef.current?.focus()
              }}
            >
              ✕
            </button>
          )}
        </div>

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
          {!activeProjectId ? (
            <div style={styles.empty}>Open a repository to search.</div>
          ) : search.error ? (
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
          <span><span style={styles.fkbd}>esc</span>close</span>
        </div>
      </div>
    </div>
  )
}
