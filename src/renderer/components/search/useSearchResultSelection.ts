import { useEffect, useMemo, useState } from 'react'
import type { UnifiedSearchResult } from '../../../shared/search-types'

interface UseSearchResultSelectionResult {
  selectedResultId: string | null
  setSelectedResultId: (resultId: string) => void
  selectedResult: UnifiedSearchResult | null
  moveSelection: (delta: number) => void
}

export function useSearchResultSelection(results: UnifiedSearchResult[]): UseSearchResultSelectionResult {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedResultId) ?? null,
    [results, selectedResultId],
  )

  useEffect(() => {
    if (results.length === 0) {
      setSelectedResultId(null)
      return
    }
    if (selectedResultId && results.some((result) => result.id === selectedResultId)) {
      return
    }
    setSelectedResultId(results[0]?.id ?? null)
  }, [results, selectedResultId])

  const moveSelection = (delta: number): void => {
    if (results.length === 0) return
    const currentIndex = selectedResult ? results.findIndex((result) => result.id === selectedResult.id) : -1
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (baseIndex + delta + results.length) % results.length
    setSelectedResultId(results[nextIndex]?.id ?? null)
  }

  return {
    selectedResultId,
    setSelectedResultId,
    selectedResult,
    moveSelection,
  }
}
