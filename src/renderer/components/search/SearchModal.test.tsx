import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { SearchModal, type SearchModalProps } from './SearchModal'
import { installElectronApi, mockInvoke } from '../../hooks/search/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

function makeProps(overrides: Partial<SearchModalProps> = {}): SearchModalProps {
  return {
    visible: true,
    onClose: vi.fn(),
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

describe('SearchModal', () => {
  it('renders nothing while closed', () => {
    render(<SearchModal {...makeProps({ visible: false })} />)
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument()
  })

  it('renders the field and scope chips when open', () => {
    render(<SearchModal {...makeProps()} />)
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search files, code and memory')).toBeInTheDocument()
    for (const scope of ['Everything', 'Code', 'Files', 'Memory']) {
      expect(screen.getByRole('button', { name: scope })).toBeInTheDocument()
    }
  })

  it('opens on the requested scope', () => {
    render(<SearchModal {...makeProps({ requestedMode: 'memory' })} />)
    // Only the active chip gets the accent-subtle fill.
    expect(screen.getByRole('button', { name: 'Memory' }).getAttribute('style')).toContain('accent-subtle')
    expect(screen.getByRole('button', { name: 'Code' }).getAttribute('style')).not.toContain('accent-subtle')
  })

  it('closes on Escape', () => {
    const props = makeProps()
    render(<SearchModal {...props} />)
    fireEvent.keyDown(screen.getByLabelText('Search files, code and memory'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', () => {
    const props = makeProps()
    render(<SearchModal {...props} />)
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Search' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows live results and opens the selected code result on Enter', async () => {
    const props = makeProps()
    render(<SearchModal {...props} />)
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'execute' } })

    await flush()                      // flush search:context effect
    act(() => { vi.advanceTimersByTime(250) }) // fire the debounced search:query
    await flush()                      // flush the query response into state

    // Code results render a snippet preview; the matched line's gutter number is a stable single text node.
    expect(screen.getByText('14')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/src/main/search/search-query-service.ts',
      line: 14,
      column: undefined,
      sessionId: undefined,
    })
    expect(props.onClose).toHaveBeenCalled()
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

    const props = makeProps()
    render(<SearchModal {...props} />)
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'search' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    expect(screen.getByText('88')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onOpenSearchResult).toHaveBeenCalledWith({
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

    render(<SearchModal {...makeProps()} />)
    fireEvent.change(screen.getByLabelText('Search files, code and memory'), { target: { value: 'manifold' } })

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

  it('renders filename matches in a Files group and opens them without a line', async () => {
    const fileResult = {
      id: 'f1',
      source: 'file' as const,
      title: 'scripts/release.sh',
      snippet: '',
      filePath: '/abs/scripts/release.sh',
      rootPath: '/abs',
      relativePath: 'scripts/release.sh',
      matchedIndices: [8, 9, 10, 11, 12, 13, 14], // "release"
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

    const props = makeProps()
    render(<SearchModal {...props} />)
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'release' } })

    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    // The Files group header renders (distinct from the "Files" scope chip button).
    expect(screen.getByText('Files', { selector: 'div' })).toBeInTheDocument()
    // The matched basename characters are highlighted via matchedIndices.
    expect(screen.getAllByText('release').some((node) => node.tagName === 'MARK')).toBe(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/scripts/release.sh',
      line: undefined,
      column: undefined,
      sessionId: undefined,
    })
  })

  it('tells the user to open a repository when none is active', () => {
    render(<SearchModal {...makeProps({ activeProjectId: null })} />)
    expect(screen.getByText('Open a repository to search.')).toBeInTheDocument()
  })
})
