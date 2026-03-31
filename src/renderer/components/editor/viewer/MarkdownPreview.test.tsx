import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownPreview } from './MarkdownPreview'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

describe('MarkdownPreview', () => {
  it('renders relative markdown images as file urls', async () => {
    render(
      <MarkdownPreview
        paneId="preview-image-test"
        filePath="/repo/docs/readme.md"
        fileContent="![Architecture](./images/architecture.png)"
        onOpenLinkedFile={vi.fn()}
      />,
    )

    expect(await screen.findByRole('img', { name: 'Architecture' }))
      .toHaveAttribute('src', 'file:///repo/docs/images/architecture.png')
  })

  it('keeps external image urls unchanged', async () => {
    render(
      <MarkdownPreview
        paneId="preview-external-image-test"
        filePath="/repo/docs/readme.md"
        fileContent="![Architecture](https://example.com/architecture.png)"
        onOpenLinkedFile={vi.fn()}
      />,
    )

    expect(await screen.findByRole('img', { name: 'Architecture' }))
      .toHaveAttribute('src', 'https://example.com/architecture.png')
  })
})
