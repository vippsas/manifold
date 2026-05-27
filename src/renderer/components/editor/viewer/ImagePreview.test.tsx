import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
