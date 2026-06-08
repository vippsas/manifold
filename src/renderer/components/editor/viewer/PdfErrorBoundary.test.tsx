import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PdfErrorBoundary } from './PdfErrorBoundary'

function Boom(): React.JSX.Element {
  throw new Error('boom-from-child')
}

describe('PdfErrorBoundary', () => {
  it('renders children when they do not throw', () => {
    render(
      <PdfErrorBoundary>
        <div>safe child</div>
      </PdfErrorBoundary>,
    )
    expect(screen.getByText('safe child')).toBeTruthy()
  })

  it('shows an inline fallback instead of crashing when a child throws', () => {
    // React logs the caught error to console.error; silence it for clean output.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PdfErrorBoundary>
        <Boom />
      </PdfErrorBoundary>,
    )
    expect(screen.getByText(/Could not display PDF: boom-from-child/)).toBeTruthy()
    spy.mockRestore()
  })
})
