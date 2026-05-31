import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImagePreview } from './ImagePreview'

describe('ImagePreview', () => {
  it('renders an img element with the supplied data URL as src', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    render(<ImagePreview filePath="/repo/logo.png" dataUrl={dataUrl} />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', dataUrl)
    expect(img).toHaveAttribute('alt', '/repo/logo.png')
  })

  it('marks the image as not draggable', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    expect(screen.getByRole('img')).toHaveAttribute('draggable', 'false')
  })

  it('shows zoom controls starting at 100%', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%')
  })

  it('increases the zoom percentage when "Zoom in" is clicked', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('120%')
  })

  it('decreases the zoom percentage when "Zoom out" is clicked', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('83%')
  })

  it('resets zoom to 100% when the percentage button is clicked', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('144%')

    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%')
  })

  it('zooms via wheel events when ctrlKey is held (trackpad pinch)', () => {
    const { container } = render(
      <ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />,
    )
    const wrapper = container.firstElementChild as HTMLElement
    // Negative deltaY = pinch out = zoom in.
    fireEvent.wheel(wrapper, { deltaY: -100, ctrlKey: true })
    const percent = screen.getByRole('button', { name: 'Reset zoom' })
    const value = parseInt(percent.textContent ?? '0', 10)
    expect(value).toBeGreaterThan(100)
  })

  it('ignores wheel events without ctrlKey (normal scroll)', () => {
    const { container } = render(
      <ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />,
    )
    const wrapper = container.firstElementChild as HTMLElement
    fireEvent.wheel(wrapper, { deltaY: -100, ctrlKey: false })
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%')
  })

  it('shows a default cursor (no panning) at 100% zoom', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    expect(screen.getByRole('img')).toHaveStyle({ cursor: 'default' })
  })

  it('offers a grab cursor for panning once zoomed in', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('img')).toHaveStyle({ cursor: 'grab' })
  })

  it('resets zoom when switching to a different file', () => {
    const { rerender } = render(
      <ImagePreview filePath="/repo/one.png" dataUrl="data:image/png;base64,AA" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('120%')

    rerender(<ImagePreview filePath="/repo/two.png" dataUrl="data:image/png;base64,BB" />)
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%')
  })
})
