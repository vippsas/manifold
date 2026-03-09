import React, { useState, useCallback, useRef } from 'react'
import { searchStyles } from './SearchResults.styles'

interface SearchMatch {
  line: number
  text: string
}

interface SearchFileResult {
  file: string
  matches: SearchMatch[]
}

interface SearchResultsProps {
  sessionId: string | null
  onSelectFile: (path: string) => void
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={searchStyles.highlight}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function shortPath(filePath: string): string {
  const parts = filePath.split('/')
  return parts.length > 2 ? parts.slice(-2).join('/') : filePath
}

export function SearchResults({ sessionId, onSelectFile }: SearchResultsProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchFileResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = useCallback(async () => {
    if (!sessionId || !query.trim()) return
    setSearching(true)
    setHasSearched(true)
    try {
      const data = await window.electronAPI.invoke('files:search-content', sessionId, query.trim()) as SearchFileResult[]
      setResults(data)
      setCollapsed(new Set())
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [sessionId, query])

  const toggleCollapse = useCallback((file: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }, [])

  return (
    <div style={searchStyles.wrapper}>
      <div style={searchStyles.inputContainer}>
        <input
          ref={inputRef}
          type="text"
          style={searchStyles.input}
          placeholder="Search in files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
        />
      </div>

      {searching ? (
        <div style={searchStyles.searching}>Searching...</div>
      ) : results.length > 0 ? (
        <div style={searchStyles.results}>
          {results.map((fileResult) => (
            <div key={fileResult.file}>
              <div
                style={searchStyles.fileHeader}
                onClick={() => toggleCollapse(fileResult.file)}
              >
                <span style={{ transform: collapsed.has(fileResult.file) ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-block', fontSize: '10px' }}>&#9654;</span>
                <span>{shortPath(fileResult.file)}</span>
                <span style={searchStyles.matchCount}>{fileResult.matches.length}</span>
              </div>
              {!collapsed.has(fileResult.file) && fileResult.matches.map((match, i) => (
                <div
                  key={`${fileResult.file}:${match.line}:${i}`}
                  style={searchStyles.matchLine}
                  onClick={() => onSelectFile(fileResult.file)}
                >
                  <span style={searchStyles.lineNumber}>{match.line}</span>
                  <span style={searchStyles.lineText}>
                    {highlightMatch(match.text, query)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : hasSearched ? (
        <div style={searchStyles.empty}>No results found</div>
      ) : (
        <div style={searchStyles.empty}>Search for text across all files</div>
      )}
    </div>
  )
}
