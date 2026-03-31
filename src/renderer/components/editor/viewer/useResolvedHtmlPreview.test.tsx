import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  injectHtmlPreviewBaseHref,
  resolveHtmlPreviewBaseHref,
  useResolvedHtmlPreview,
} from './useResolvedHtmlPreview'

function HookHarness({
  fileContent,
  activeFilePath,
}: {
  fileContent: string
  activeFilePath: string
}): React.JSX.Element {
  const resolvedHtml = useResolvedHtmlPreview({
    isHtml: true,
    fileContent,
    sessionId: 'session-1',
    activeFilePath,
  })

  return <div data-testid="resolved-html">{resolvedHtml}</div>
}

describe('useResolvedHtmlPreview', () => {
  beforeEach(() => {
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'files:read') return 'body { color: red; }'
        if (channel === 'files:read-data-url') return 'data:image/png;base64,ZmFrZQ=='
        return null
      }),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      getPathForFile: vi.fn(),
    }
  })

  it('injects a base href when the preview document has no head', async () => {
    render(
      <HookHarness
        activeFilePath="/repo/docs/index.html"
        fileContent={'<body><p>Hello</p></body>'}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('resolved-html'))
        .toHaveTextContent('<head><base href="file:///repo/docs/"></head><body><p>Hello</p></body>')
    })
  })

  it('inlines relative html images as data urls', async () => {
    render(
      <HookHarness
        activeFilePath="/repo/docs/index.html"
        fileContent={'<body><img src="./images/overview.png" alt="Overview"></body>'}
      />,
    )

    await waitFor(() => {
      expect(window.electronAPI.invoke)
        .toHaveBeenCalledWith('files:read-data-url', 'session-1', '/repo/docs/images/overview.png')
      expect(screen.getByTestId('resolved-html'))
        .toHaveTextContent('<head><base href="file:///repo/docs/"></head><body><img src="data:image/png;base64,ZmFrZQ==" alt="Overview"></body>')
    })
  })

  it('resolves relative stylesheet paths before reading them', async () => {
    render(
      <HookHarness
        activeFilePath="/repo/docs/pages/index.html"
        fileContent={'<head><link rel="stylesheet" href="../styles/site.css"></head><body></body>'}
      />,
    )

    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('files:read', 'session-1', '/repo/docs/styles/site.css')
    })
  })
})

describe('injectHtmlPreviewBaseHref', () => {
  it('preserves an existing base tag', () => {
    expect(injectHtmlPreviewBaseHref(
      '<head><base href="https://example.com/"></head><body></body>',
      'file:///repo/docs/',
    )).toBe('<head><base href="https://example.com/"></head><body></body>')
  })

  it('builds a file base href from windows paths', () => {
    expect(resolveHtmlPreviewBaseHref('C:\\repo\\docs\\index.html')).toBe('file:///C:/repo/docs/')
  })
})
