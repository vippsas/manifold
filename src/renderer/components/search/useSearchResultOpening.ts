import type React from 'react'
import type { UnifiedSearchResult } from '../../../shared/search-types'

interface OpenSearchResultRequest {
  path: string
  line: number
  column?: number
  sessionId?: string
}

interface UseSearchResultOpeningParams {
  results: UnifiedSearchResult[]
  selectedResult: UnifiedSearchResult | null
  markCurrentSearchUsed: (resultCount: number) => unknown
  onOpenSearchResult: (request: OpenSearchResultRequest) => void
  onOpenSearchResultInSplit: (request: OpenSearchResultRequest) => void
  moveSelection: (delta: number) => void
}

interface SearchResultOpening {
  openCodeResult: (filePath: string, line: number, column: number | undefined, sessionId?: string) => void
  handleInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

/** Result-opening + keyboard navigation handlers for the SearchPanel. */
export function useSearchResultOpening({
  results,
  selectedResult,
  markCurrentSearchUsed,
  onOpenSearchResult,
  onOpenSearchResultInSplit,
  moveSelection,
}: UseSearchResultOpeningParams): SearchResultOpening {
  const openCodeResult = (filePath: string, line: number, column: number | undefined, sessionId?: string): void => {
    void markCurrentSearchUsed(results.length)
    onOpenSearchResult({ path: filePath, line, column, sessionId })
  }

  const openCodeResultInSplit = (filePath: string, line: number, column: number | undefined, sessionId?: string): void => {
    void markCurrentSearchUsed(results.length)
    onOpenSearchResultInSplit({ path: filePath, line, column, sessionId })
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
      void markCurrentSearchUsed(results.length)
    }
  }

  return { openCodeResult, handleInputKeyDown }
}
