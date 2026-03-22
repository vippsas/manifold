import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UnifiedSearchResult } from '../../../shared/search-types'
import { useSearchResultSelection } from './useSearchResultSelection'

describe('useSearchResultSelection', () => {
  it('preserves the selected code result when refreshed results use new ids', () => {
    const initialResults = [
      createCodeResult('result-1', '/repo/src/first.ts', 10),
      createCodeResult('result-2', '/repo/src/second.ts', 20),
      createCodeResult('result-3', '/repo/src/third.ts', 30),
    ]

    const { result, rerender } = renderHook(
      ({ results }) => useSearchResultSelection(results),
      { initialProps: { results: initialResults } },
    )

    act(() => {
      result.current.setSelectedResultId('result-3')
    })

    rerender({ results: [] })

    rerender({
      results: [
        createCodeResult('refreshed-1', '/repo/src/first.ts', 10),
        createCodeResult('refreshed-2', '/repo/src/second.ts', 20),
        createCodeResult('refreshed-3', '/repo/src/third.ts', 30),
      ],
    })

    expect(result.current.selectedResultId).toBe('refreshed-3')
    expect(result.current.selectedResult?.source).toBe('code')
    expect(result.current.selectedResult && result.current.selectedResult.source === 'code'
      ? result.current.selectedResult.filePath
      : null).toBe('/repo/src/third.ts')
  })
})

function createCodeResult(id: string, filePath: string, line: number): UnifiedSearchResult {
  return {
    id,
    source: 'code',
    title: filePath.split('/').at(-1) ?? filePath,
    snippet: 'match',
    filePath,
    rootPath: '/repo',
    relativePath: filePath.replace('/repo/', ''),
    line,
    sessionId: 'session-1',
  }
}
