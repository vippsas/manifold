import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import mermaid from 'mermaid'
import { MermaidBlock } from './MermaidBlock'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

beforeEach(() => {
  vi.mocked(mermaid.render).mockReset()
})

describe('MermaidBlock', () => {
  it('renders SVG on success', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg data-testid="rendered">diagram</svg>', bindFunctions: undefined })

    render(<MermaidBlock chart="graph TD; A-->B" />)

    await waitFor(() => {
      expect(screen.getByTestId('rendered')).toBeInTheDocument()
    })
  })

  it('shows error and raw code on failure', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('Parse error'))

    render(<MermaidBlock chart="invalid mermaid" />)

    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeInTheDocument()
    })
    expect(screen.getByText('invalid mermaid')).toBeInTheDocument()
  })

  it('shows loading state while rendering', () => {
    vi.mocked(mermaid.render).mockReturnValue(new Promise(() => {}))

    render(<MermaidBlock chart="graph TD; A-->B" />)

    expect(screen.getByText('Rendering diagram…')).toBeInTheDocument()
  })
})
