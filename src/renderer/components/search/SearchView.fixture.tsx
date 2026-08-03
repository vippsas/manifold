// Screenshot fixture for SearchView — see scripts/screenshot-component.mjs.
// `npm run screenshot:component SearchView --theme manifold-dark` renders the view
// inline in a 260px sidebar column, the width it has to survive.
import React, { useEffect } from 'react'
import type { UnifiedSearchResult } from '../../../shared/search-types'
import { SearchView } from './SearchView'

const results: UnifiedSearchResult[] = [
  {
    id: 'f1',
    source: 'file',
    title: 'src/main/search/search-query-service.ts',
    snippet: '',
    filePath: '/repo/src/main/search/search-query-service.ts',
    rootPath: '/repo',
    relativePath: 'src/main/search/search-query-service.ts',
    matchedIndices: [16, 17, 18, 19, 20, 21],
  },
  {
    id: 'c1',
    source: 'code',
    title: 'src/main/search/search-query-service.ts',
    snippet: 'export async function executeSearchQuery(request: SearchQueryRequest) {',
    filePath: '/repo/src/main/search/search-query-service.ts',
    rootPath: '/repo',
    relativePath: 'src/main/search/search-query-service.ts',
    line: 42,
    contextBefore: ['/** Runs one unified search across code, files and memory. */'],
    contextAfter: ['  const scope = resolveScope(request)'],
  },
  {
    id: 'm1',
    source: 'memory',
    title: 'Search now runs through a single query service',
    snippet: '',
    memorySource: 'session_summary',
    createdAt: Date.UTC(2026, 6, 20),
  },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'search:context') return Promise.resolve({ projectId: 'demo', activeSessionId: null, sessions: [] })
    if (channel === 'search:query') return Promise.resolve({ results, total: results.length, tookMs: 4 })
    return baseStub.invoke(channel, ...args)
  },
}

export default function SearchViewFixture(): React.JSX.Element {
  // Type into the field after mount so the capture shows results, not the empty state.
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('.search-modal-input')
    if (!input) return
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, 'search')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-secondary)' }}>
      <div style={{ width: 260, height: '100%', borderRight: '1px solid var(--divider)', background: 'var(--bg-primary)' }}>
        <SearchView
          activeProjectId="demo"
          activeSessionId={null}
          allProjectSessions={{}}
          onOpenSearchResult={() => undefined}
        />
      </div>
    </div>
  )
}
