import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { SearchView, type SearchViewProps } from './SearchView'
import { installElectronApi, mockInvoke } from '../../hooks/search/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

function makeProps(overrides: Partial<SearchViewProps> = {}): SearchViewProps {
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

describe('SearchView', () => {
  it('renders standalone without modal chrome', () => {
    render(<SearchView {...makeProps()} />)
    expect(screen.getByLabelText('Search files, code and memory')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('close')).not.toBeInTheDocument()
  })

  it('fills its container and scrolls its own results', () => {
    const { container } = render(<SearchView {...makeProps()} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.height).toBe('100%')
    expect(wrapper.style.width).toBe('100%')
    expect(wrapper.style.position).toBe('')
  })

  it('runs a search and opens the selected result without closing anything', async () => {
    const props = makeProps()
    render(<SearchView {...props} />)
    const input = screen.getByLabelText('Search files, code and memory')
    fireEvent.change(input, { target: { value: 'execute' } })

    await flush()                              // flush search:context effect
    act(() => { vi.advanceTimersByTime(250) }) // fire the debounced search:query
    await flush()                              // flush the query response into state

    expect(screen.getByText('14')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/src/main/search/search-query-service.ts',
      line: 14,
      column: undefined,
      sessionId: undefined,
    })
  })

  it('preselects the requested scope', () => {
    render(<SearchView {...makeProps({ requestedMode: 'memory' })} />)
    expect(screen.getByRole('button', { name: 'Memory' }).getAttribute('style')).toContain('accent-subtle')
  })
})
