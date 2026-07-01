import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { SearchView } from './SearchView'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'
import { installElectronApi, mockInvoke } from '../../hooks/search/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

function renderView(overrides: Partial<DockAppState> = {}): { onOpenSearchResult: ReturnType<typeof vi.fn> } {
  const onOpenSearchResult = vi.fn()
  render(
    <DockStateContext.Provider
      value={{
        activeProjectId: 'project-1',
        sessionId: 'session-1',
        allProjectSessions: {},
        onOpenSearchResult,
        searchFocusRequestKey: 0,
        requestedSearchMode: null,
        ...overrides,
      } as unknown as DockAppState}
    >
      <SearchView />
    </DockStateContext.Provider>,
  )
  return { onOpenSearchResult }
}

const CODE_RESULT = {
  id: 'r1',
  source: 'code' as const,
  title: 'executeSearchQuery',
  snippet: 'export async function executeSearchQuery(req) {',
  filePath: '/abs/src/main/search/search-query-service.ts',
  rootPath: '/abs',
  relativePath: 'src/main/search/search-query-service.ts',
  line: 14,
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  installElectronApi()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
    if (channel === 'search:context') {
      return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
    }
    if (channel === 'search:query') {
      return Promise.resolve({ results: [CODE_RESULT], total: 1, tookMs: 3 })
    }
    return Promise.reject(new Error(`Unexpected channel: ${channel}`))
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SearchView', () => {
  it('renders an always-visible search field', () => {
    renderView()
    expect(screen.getByLabelText('Search files, code and memory')).toBeInTheDocument()
  })

  it('shows the scope chips without needing focus', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Memory' })).toBeInTheDocument()
  })

  it('shows live results and opens the selected code result on Enter', async () => {
    const { onOpenSearchResult } = renderView()
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'execute' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    expect(screen.getByText('14')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/src/main/search/search-query-service.ts',
      line: 14,
      column: undefined,
      sessionId: undefined,
    })
  })

  it('moves selection with ArrowDown and opens the second result on Enter', async () => {
    const secondResult = {
      ...CODE_RESULT,
      id: 'r2',
      filePath: '/abs/src/main/search/search-index.ts',
      relativePath: 'src/main/search/search-index.ts',
      line: 88,
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
      }
      if (channel === 'search:query') {
        return Promise.resolve({ results: [CODE_RESULT, secondResult], total: 2, tookMs: 3 })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    const { onOpenSearchResult } = renderView()
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'search' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    expect(screen.getByText('88')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/src/main/search/search-index.ts',
      line: 88,
      column: undefined,
      sessionId: undefined,
    })
  })

  it('renders a code preview with context lines, a gutter, and a highlighted match', async () => {
    const previewResult = {
      id: 'p1',
      source: 'code' as const,
      title: 'scripts/rebuild-better-sqlite3-node.mjs',
      snippet: "npm_config_cache: '/tmp/manifold-npm-cache',",
      filePath: '/abs/scripts/rebuild-better-sqlite3-node.mjs',
      rootPath: '/abs',
      relativePath: 'scripts/rebuild-better-sqlite3-node.mjs',
      line: 19,
      contextBefore: ["npm_config_build_from_source: 'true',"],
      contextAfter: ['npm_config_nodedir: nodeRoot,'],
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
      }
      if (channel === 'search:query') {
        return Promise.resolve({ results: [previewResult], total: 1, tookMs: 3 })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    renderView()
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'manifold' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    expect(screen.getByText('scripts/rebuild-better-sqlite3-node.mjs')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText("npm_config_build_from_source: 'true',")).toBeInTheDocument()
    expect(screen.getByText('npm_config_nodedir: nodeRoot,')).toBeInTheDocument()
    expect(screen.getAllByText('manifold').some((node) => node.tagName === 'MARK')).toBe(true)
  })

  it('renders filename matches in a Files group and opens them without a line', async () => {
    const fileResult = {
      id: 'f1',
      source: 'file' as const,
      title: 'scripts/release.sh',
      snippet: '',
      filePath: '/abs/scripts/release.sh',
      rootPath: '/abs',
      relativePath: 'scripts/release.sh',
      matchedIndices: [8, 9, 10, 11, 12, 13, 14],
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
      if (channel === 'search:context') {
        return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
      }
      if (channel === 'search:query') {
        return Promise.resolve({ results: [fileResult], total: 1, tookMs: 2 })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    const { onOpenSearchResult } = renderView()
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'release' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    // The Files group header (a div) is distinct from the "Files" scope chip button.
    expect(screen.getByText('Files', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getAllByText('release').some((node) => node.tagName === 'MARK')).toBe(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/scripts/release.sh',
      line: undefined,
      column: undefined,
      sessionId: undefined,
    })
  })
})
