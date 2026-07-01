import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'
import { installElectronApi } from '../hooks/search/useSearch.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  installElectronApi()
})

afterEach(() => {
  vi.clearAllMocks()
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

  it('does not render the search omnibox (search moved to the sidebar Search tab)', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByLabelText('Search files, code and memory')).not.toBeInTheDocument()
  })
})
