import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CodeViewer } from './CodeViewer'
import { getEditorPaneModeControls } from './editor-pane-mode-controls'
import type { FileOpenRequest } from './file-open-request'
import { makeOpenFile, makeOpenRequest, renderViewer } from './CodeViewer.test-helpers'

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')

  function MockEditor({ value, defaultValue }: { value?: string; defaultValue?: string }): React.JSX.Element {
    const [initialValue] = React.useState(value ?? defaultValue)
    return <div data-testid="monaco-editor">{initialValue}</div>
  }

  function MockDiffEditor({ modified }: { modified: string }): React.JSX.Element {
    const [initialModified] = React.useState(modified)
    return <div data-testid="monaco-diff-editor">{initialModified}</div>
  }

  return {
    default: MockEditor,
    DiffEditor: MockDiffEditor,
  }
})

vi.mock('react-markdown', () => ({
  default: ({
    children,
    components,
  }: {
    children: React.ReactNode
    components?: { a?: React.ComponentType<{ href?: string; children: React.ReactNode }> }
  }) => {
    const content = String(children)
    const linkMatch = content.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/)

    if (linkMatch && components?.a) {
      const Anchor = components.a
      return (
        <div data-testid="markdown-preview">
          <Anchor href={linkMatch[2]}>{linkMatch[1]}</Anchor>
        </div>
      )
    }

    return <div data-testid="markdown-preview">{children}</div>
  },
}))

vi.mock('remark-gfm', () => ({
  default: () => null,
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

describe('CodeViewer — markdown, links & tabs', () => {
  it('opens a tab context menu and sends the clicked file to a directional split pane', () => {
    const onSelectTab = vi.fn()
    const onMoveTabToSplitPane = vi.fn()

    renderViewer({
      onSelectTab,
      onMoveTabToSplitPane,
    })

    const tab = screen.getByRole('button', { name: 'file.ts' }).closest('div')
    expect(tab).not.toBeNull()
    fireEvent.contextMenu(tab as HTMLDivElement)

    expect(onSelectTab).toHaveBeenCalledWith('/repo/file.ts')
    expect(screen.getByRole('menuitem', { name: 'Split pane to the bottom' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split pane to the right' }))

    expect(onMoveTabToSplitPane).toHaveBeenCalledWith('/repo/file.ts', 'right')
  })

  it('opens relative markdown links in the current editor pane', async () => {
    const onOpenLinkedFile = vi.fn()

    renderViewer({
      openFiles: [makeOpenFile({ path: '/repo/docs/readme.md', content: '[Child note](./notes/child.md)' })],
      activeFilePath: '/repo/docs/readme.md',
      fileContent: '[Child note](./notes/child.md)',
      onOpenLinkedFile,
    })

    // Markdown files auto-open in preview mode
    const link = await screen.findByRole('link', { name: 'Child note' })
    fireEvent.click(link)

    expect(onOpenLinkedFile).toHaveBeenCalledWith('/repo/docs/notes/child.md')
  })

  it('opens linked markdown files directly in preview mode', async () => {
    function Wrapper(): React.JSX.Element {
      const files = React.useMemo<Record<string, string>>(() => ({
        '/repo/docs/readme.md': '[Child note](./notes/child.md)',
        '/repo/docs/notes/child.md': '# Child preview',
      }), [])
      const [activeFilePath, setActiveFilePath] = React.useState('/repo/docs/readme.md')
      const [lastFileOpenRequest, setLastFileOpenRequest] = React.useState<FileOpenRequest>(
        makeOpenRequest({ path: '/repo/docs/readme.md' }),
      )

      return (
        <CodeViewer
          paneId="editor-preview-link-open-test"
          sessionId="session-1"
          fileDiffText={null}
          originalContent={null}
          openFiles={Object.entries(files).map(([path, content]) => makeOpenFile({ path, content }))}
          activeFilePath={activeFilePath}
          fileContent={files[activeFilePath]}
          lastFileOpenRequest={lastFileOpenRequest}
          theme="jacob-co-dark"
          onSelectTab={vi.fn()}
          onOpenLinkedFile={(filePath) => {
            setActiveFilePath(filePath)
            setLastFileOpenRequest(makeOpenRequest({ path: filePath, source: 'markdownPreview' }))
          }}
          onCloseTab={vi.fn()}
          onSaveFile={vi.fn()}
        />
      )
    }

    render(<Wrapper />)

    // Markdown files auto-open in preview mode
    const link = await screen.findByRole('link', { name: 'Child note' })
    fireEvent.click(link)

    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Child preview')
    })
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('switches a previewed markdown file to editor mode when the user toggles editor', async () => {
    const paneId = 'editor-md-toggle-test'
    renderViewer({
      paneId,
      openFiles: [makeOpenFile({ path: '/repo/readme.md', content: '# Hello' })],
      activeFilePath: '/repo/readme.md',
      fileContent: '# Hello',
      lastFileOpenRequest: makeOpenRequest({ path: '/repo/readme.md' }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Hello')
    })

    act(() => {
      getEditorPaneModeControls(paneId)?.showEditor()
    })

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('# Hello')
    })
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
  })

  it('keeps linked markdown targets in preview mode across a pane remount', async () => {
    function Wrapper(): React.JSX.Element {
      const files = React.useMemo<Record<string, string>>(() => ({
        '/repo/docs/readme.md': '[Child note](./notes/child.md)',
        '/repo/docs/notes/child.md': '# Child preview',
      }), [])
      const [activeFilePath, setActiveFilePath] = React.useState('/repo/docs/readme.md')
      const [lastFileOpenRequest, setLastFileOpenRequest] = React.useState<FileOpenRequest>(
        makeOpenRequest({ path: '/repo/docs/readme.md' }),
      )

      return (
        <CodeViewer
          key={activeFilePath}
          paneId="editor-preview-remount-test"
          sessionId="session-1"
          fileDiffText={null}
          originalContent={null}
          openFiles={Object.entries(files).map(([path, content]) => makeOpenFile({ path, content }))}
          activeFilePath={activeFilePath}
          fileContent={files[activeFilePath]}
          lastFileOpenRequest={lastFileOpenRequest}
          theme="jacob-co-dark"
          onSelectTab={vi.fn()}
          onOpenLinkedFile={(filePath) => {
            setActiveFilePath(filePath)
            setLastFileOpenRequest(makeOpenRequest({ path: filePath, source: 'markdownPreview' }))
          }}
          onCloseTab={vi.fn()}
          onSaveFile={vi.fn()}
        />
      )
    }

    render(<Wrapper />)

    const link = await screen.findByRole('link', { name: 'Child note' })
    fireEvent.click(link)

    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Child preview')
    })
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('preserves markdown preview scroll when pane activation remounts the viewer', async () => {
    function Wrapper(): React.JSX.Element {
      const [activations, setActivations] = React.useState(0)
      const remountKey = activations > 1 ? activations : 0

      return (
        <CodeViewer
          key={remountKey}
          paneId="editor-scroll-test"
          sessionId="session-1"
          fileDiffText={null}
          originalContent={null}
          openFiles={[makeOpenFile({ path: '/repo/readme.md', content: '# Hello' })]}
          activeFilePath="/repo/readme.md"
          fileContent={'# Hello\n\n' + 'Line\n'.repeat(200)}
          lastFileOpenRequest={makeOpenRequest({ path: '/repo/readme.md' })}
          theme="jacob-co-dark"
          onActivatePane={() => setActivations((value) => value + 1)}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onSaveFile={vi.fn()}
        />
      )
    }

    const { container } = render(<Wrapper />)

    // Markdown files auto-open in preview mode
    await waitFor(() => {
      expect(container.querySelector('.markdown-preview')).not.toBeNull()
    })

    const preview = container.querySelector('.markdown-preview') as HTMLDivElement
    preview.scrollTop = 240
    fireEvent.scroll(preview)

    fireEvent.mouseDown(preview)

    await waitFor(() => {
      expect((container.querySelector('.markdown-preview') as HTMLDivElement).scrollTop).toBe(240)
    })
  })

  it('shows the basename unchanged for long file names', () => {
    renderViewer({
      openFiles: [makeOpenFile({ path: '/repo/repository-provisioning-display-plan.md' })],
      activeFilePath: '/repo/repository-provisioning-display-plan.md',
      fileContent: 'plan',
    })

    expect(screen.getByRole('button', { name: 'repository-provisioning-display-plan.md' })).toBeInTheDocument()
  })

  it('adds directory context only when duplicate basenames are open', () => {
    renderViewer({
      openFiles: [
        makeOpenFile({ path: '/repo/docs/readme.md', content: '# Docs' }),
        makeOpenFile({ path: '/repo/reference/readme.md', content: '# Reference' }),
      ],
      activeFilePath: '/repo/docs/readme.md',
      fileContent: '# Docs',
    })

    expect(screen.getByRole('button', { name: /readme\.md\s*•\s*docs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /readme\.md\s*•\s*reference/ })).toBeInTheDocument()
  })
})
