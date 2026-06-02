import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'
import { installElectronApi, mockInvoke } from '../hooks/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

beforeEach(() => {
  installElectronApi()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
    if (channel === 'search:context') {
      return Promise.resolve({ projectId: 'project-1', activeSessionId: null, sessions: [] })
    }
    return Promise.resolve({ results: [], total: 0, tookMs: 0 })
  })
})

describe('TitleBar', () => {
  it('shows "Manifold" when no project is active', () => {
    render(<TitleBar />)
    expect(screen.getByText('Manifold')).toBeInTheDocument()
  })

  it('renders the active project name as a rename button', () => {
    render(<TitleBar projectName="Alpha" onRename={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('commits a new name on Enter', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Beta')
  })

  it('discards the edit on Escape', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('ignores an unchanged or empty name', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('renders the search omnibox when search wiring is provided', () => {
    render(
      <TitleBar
        projectName="Alpha"
        onRename={vi.fn()}
        search={{
          activeProjectId: 'project-1',
          activeSessionId: null,
          allProjectSessions: {},
          onOpenSearchResult: vi.fn(),
        }}
      />,
    )
    expect(screen.getByLabelText('Search code and memory')).toBeInTheDocument()
  })

  it('does not render the omnibox without search wiring', () => {
    render(<TitleBar projectName="Alpha" onRename={vi.fn()} />)
    expect(screen.queryByLabelText('Search code and memory')).not.toBeInTheDocument()
  })
})
