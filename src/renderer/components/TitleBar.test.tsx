import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'

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

  it('carries no controls — search lives in the activity rail, themes in Settings and the command palette', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Theme')).toBeNull()
    expect(screen.queryByLabelText('Search files, code and memory')).toBeNull()
  })
})
