import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'
import { installElectronApi, mockInvoke } from '../hooks/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

function makeWiring(overrides: Partial<TitleBarSearchWiring> = {}): TitleBarSearchWiring {
  return {
    activeProjectId: 'project-1',
    activeSessionId: 'session-1',
    allProjectSessions: {},
    onOpenSearchResult: vi.fn(),
    ...overrides,
  }
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

describe('TitleBarSearch', () => {
  it('renders an always-visible search field', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    expect(screen.getByLabelText('Search code and memory')).toBeInTheDocument()
  })

  it('opens the dropdown with scope chips on focus', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    fireEvent.focus(screen.getByLabelText('Search code and memory'))
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Memory' })).toBeInTheDocument()
  })

  it('closes the dropdown on Escape', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
  })

  it('shows live results and opens the selected code result on Enter', async () => {
    const wiring = makeWiring()
    render(<TitleBarSearch search={wiring} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'execute' } })

    await flush()                      // flush search:context effect
    act(() => { vi.advanceTimersByTime(250) }) // fire the debounced search:query
    await flush()                      // flush the query response into state

    // Code results render a snippet preview; the matched line's gutter number is a stable single text node.
    expect(screen.getByText('14')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(wiring.onOpenSearchResult).toHaveBeenCalledWith({
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

    const wiring = makeWiring()
    render(<TitleBarSearch search={wiring} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'search' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    expect(screen.getByText('88')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(wiring.onOpenSearchResult).toHaveBeenCalledWith({
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

    render(<TitleBarSearch search={makeWiring()} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'manifold' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    // File-path header
    expect(screen.getByText('scripts/rebuild-better-sqlite3-node.mjs')).toBeInTheDocument()
    // Line-number gutter spans 18–20 around the match on line 19
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    // Context lines render verbatim
    expect(screen.getByText("npm_config_build_from_source: 'true',")).toBeInTheDocument()
    expect(screen.getByText('npm_config_nodedir: nodeRoot,')).toBeInTheDocument()
    // The matched term is highlighted inside the current line
    expect(screen.getAllByText('manifold').some((node) => node.tagName === 'MARK')).toBe(true)
  })

  it('closes the dropdown on outside mousedown', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    fireEvent.focus(screen.getByLabelText('Search code and memory'))
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
  })
})
