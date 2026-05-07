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

  it('renders YAML frontmatter as a key/value block and hides the raw block from body', async () => {
    const content = [
      '---',
      'description: Research on enterprise spend',
      'created: 2026-05-06',
      'author: Sven Malvik',
      'labels: [ai-cost, finops]',
      '---',
      '',
      '# Heading',
    ].join('\n')

    render(
      <MarkdownPreview
        paneId="preview-frontmatter-test"
        filePath="/repo/docs/readme.md"
        fileContent={content}
        onOpenLinkedFile={vi.fn()}
      />,
    )

    const frontmatter = await screen.findByLabelText('Frontmatter')
    expect(frontmatter).toHaveTextContent('description')
    expect(frontmatter).toHaveTextContent('Research on enterprise spend')
    expect(frontmatter).toHaveTextContent('Sven Malvik')
    expect(frontmatter).toHaveTextContent('[ai-cost, finops]')
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument()
    expect(frontmatter.textContent).not.toContain('---')
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
