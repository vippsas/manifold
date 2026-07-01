import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'
import { installElectronApi, mockInvoke } from '../hooks/search/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

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
      return Promise.resolve({ projectId: 'project-1', activeSessionId: null, sessions: [] })
    }
    return Promise.resolve({ results: [], total: 0, tookMs: 0 })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TitleBar', () => {
  it('shows "Manifold" when no project is active', () => {
    render(<TitleBar />)
    expect(screen.getByText('Manifold')).toBeInTheDocument()
  })

  it('shows no name when a project is active', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Manifold')).not.toBeInTheDocument()
  })

  it('renders the search omnibox when search wiring is provided', async () => {
    render(
      <TitleBar
        projectName="Alpha"
        search={{
          activeProjectId: 'project-1',
          activeSessionId: null,
          allProjectSessions: {},
          onOpenSearchResult: vi.fn(),
          focusRequestKey: 0,
          requestedMode: null,
        }}
      />,
    )
    expect(screen.getByLabelText('Search files, code and memory')).toBeInTheDocument()
    await flush() // drain the omnibox's useSearch mount effects (settings:get / search:context)
  })

  it('does not render the omnibox without search wiring', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByLabelText('Search code and memory')).not.toBeInTheDocument()
  })
})
