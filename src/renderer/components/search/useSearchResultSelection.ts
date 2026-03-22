import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CodeSearchResult, MemorySearchResultItem, UnifiedSearchResult } from '../../../shared/search-types'

interface UseSearchResultSelectionResult {
  selectedResultId: string | null
  setSelectedResultId: (resultId: string) => void
  selectedResult: UnifiedSearchResult | null
  moveSelection: (delta: number) => void
}

export function useSearchResultSelection(results: UnifiedSearchResult[]): UseSearchResultSelectionResult {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [selectedResultAnchor, setSelectedResultAnchor] = useState<UnifiedSearchResult | null>(null)

  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedResultId) ?? null,
    [results, selectedResultId],
  )

  useEffect(() => {
    if (results.length === 0) {
      setSelectedResultId(null)
      return
    }

    const selectedById = selectedResultId
      ? results.find((result) => result.id === selectedResultId) ?? null
      : null

    if (selectedById) {
      setSelectedResultAnchor((current) => (current?.id === selectedById.id ? current : selectedById))
      return
    }

    const selectedByAnchor = selectedResultAnchor
      ? results.find((result) => isSameSearchResult(result, selectedResultAnchor)) ?? null
      : null

    if (selectedByAnchor) {
      setSelectedResultId(selectedByAnchor.id)
      setSelectedResultAnchor(selectedByAnchor)
      return
    }

    const fallback = results[0] ?? null
    setSelectedResultId(fallback?.id ?? null)
    setSelectedResultAnchor(fallback)
  }, [results, selectedResultAnchor, selectedResultId])

  const selectResultById = useCallback((resultId: string): void => {
    const nextSelectedResult = results.find((result) => result.id === resultId) ?? null
    setSelectedResultId(resultId)
    if (nextSelectedResult) {
      setSelectedResultAnchor(nextSelectedResult)
    }
  }, [results])

  const moveSelection = useCallback((delta: number): void => {
    if (results.length === 0) return

    const currentIndex = selectedResult ? results.findIndex((result) => result.id === selectedResult.id) : -1
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (baseIndex + delta + results.length) % results.length
    const nextSelectedResult = results[nextIndex] ?? null

    setSelectedResultId(nextSelectedResult?.id ?? null)
    if (nextSelectedResult) {
      setSelectedResultAnchor(nextSelectedResult)
    }
  }, [results, selectedResult])

  return {
    selectedResultId,
    setSelectedResultId: selectResultById,
    selectedResult,
    moveSelection,
  }
}

function isSameSearchResult(left: UnifiedSearchResult, right: UnifiedSearchResult): boolean {
  if (left.source !== right.source) return false

  if (left.source === 'code' && right.source === 'code') {
    return isSameCodeResult(left, right)
  }

  if (left.source === 'memory' && right.source === 'memory') {
    return isSameMemoryResult(left, right)
  }

  return false
}

function isSameCodeResult(left: CodeSearchResult, right: CodeSearchResult): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.filePath === right.filePath &&
    left.line === right.line &&
    (left.column ?? 1) === (right.column ?? 1)
  )
}

function isSameMemoryResult(left: MemorySearchResultItem, right: MemorySearchResultItem): boolean {
  return (
    left.projectId === right.projectId &&
    left.sessionId === right.sessionId &&
    left.memorySource === right.memorySource &&
    left.createdAt === right.createdAt &&
    left.title === right.title
  )
}
