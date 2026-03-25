import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { OpenFile } from '../../hooks/useCodeView'
import { CodeViewer } from './CodeViewer'
import type { FileOpenRequest } from './file-open-request'

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

function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path: '/repo/file.ts',
    content: 'const value = 1',
    refreshVersion: 0,
    ...overrides,
  }
}

function makeOpenRequest(overrides: Partial<FileOpenRequest> = {}): FileOpenRequest {
  return {
    path: null,
    source: 'default',
    ...overrides,
  }
}

function renderViewer(overrides: Partial<React.ComponentProps<typeof CodeViewer>> = {}) {
  const openFile = makeOpenFile()
  const props: React.ComponentProps<typeof CodeViewer> = {
    sessionId: 'session-1',
    fileDiffText: null,
    originalContent: null,
    openFiles: [openFile],
    activeFilePath: openFile.path,
    fileContent: openFile.content,
    lastFileOpenRequest: makeOpenRequest(),
    theme: 'vs-dark',
    onSelectTab: vi.fn(),
    onOpenLinkedFile: vi.fn(),
    onCloseTab: vi.fn(),
    onSaveFile: vi.fn(),
    ...overrides,
  }

  return render(<CodeViewer {...props} />)
}

describe('CodeViewer', () => {
  it('remounts the editor when an open file is refreshed from disk', () => {
    const openFile = makeOpenFile()
    const { rerender } = renderViewer({
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
    })

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('const value = 1')

    const refreshedFile = makeOpenFile({
      content: 'const value = 2',
      refreshVersion: 1,
    })

    rerender(
      <CodeViewer
        sessionId="session-1"
        fileDiffText={null}
        originalContent={null}
        openFiles={[refreshedFile]}
        activeFilePath={refreshedFile.path}
        fileContent={refreshedFile.content}
        lastFileOpenRequest={makeOpenRequest()}
        theme="vs-dark"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSaveFile={vi.fn()}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('const value = 2')
  })

  it('remounts the diff editor when an open file is refreshed from disk', async () => {
    const openFile = makeOpenFile()
    const { rerender } = renderViewer({
      fileDiffText: 'diff --git a/file.ts b/file.ts',
      originalContent: 'const value = 0',
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
      lastFileOpenRequest: makeOpenRequest({ path: openFile.path }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('const value = 1')
    })

    const refreshedFile = makeOpenFile({
      content: 'const value = 2',
      refreshVersion: 1,
    })

    rerender(
      <CodeViewer
        sessionId="session-1"
        fileDiffText="diff --git a/file.ts b/file.ts"
        originalContent="const value = 0"
        openFiles={[refreshedFile]}
        activeFilePath={refreshedFile.path}
        fileContent={refreshedFile.content}
        lastFileOpenRequest={makeOpenRequest({ path: refreshedFile.path })}
        theme="vs-dark"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSaveFile={vi.fn()}
      />,
    )

    expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('const value = 2')
  })

  it('auto-opens diff for non-file-tree selections when diff data exists', async () => {
    const openFile = makeOpenFile({
      path: '/repo/src/index.ts',
      content: 'new',
    })

    renderViewer({
      fileDiffText: 'diff --git a/src/index.ts b/src/index.ts',
      originalContent: 'old',
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
      lastFileOpenRequest: makeOpenRequest({ path: openFile.path, source: 'default' }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('new')
    })
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('opens in editor instead of diff when the file was opened from the file tree', async () => {
    const openFile = makeOpenFile({
      path: '/repo/src/index.ts',
      content: 'new',
    })

    renderViewer({
      fileDiffText: 'diff --git a/src/index.ts b/src/index.ts',
      originalContent: 'old',
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
      lastFileOpenRequest: makeOpenRequest({ path: openFile.path, source: 'fileTree' }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('new')
    })
    expect(screen.queryByTestId('monaco-diff-editor')).not.toBeInTheDocument()
  })

  it('opens in editor instead of diff when the file was opened from markdown preview', async () => {
    const openFile = makeOpenFile({
      path: '/repo/src/index.ts',
      content: 'new',
    })

    renderViewer({
      fileDiffText: 'diff --git a/src/index.ts b/src/index.ts',
      originalContent: 'old',
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
      lastFileOpenRequest: makeOpenRequest({ path: openFile.path, source: 'markdownPreview' }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('new')
    })
    expect(screen.queryByTestId('monaco-diff-editor')).not.toBeInTheDocument()
  })

  it('keeps preview button working when pane activation triggers a rerender', async () => {
    function Wrapper(): React.JSX.Element {
      const [activations, setActivations] = React.useState(0)

      return (
        <CodeViewer
          sessionId="session-1"
          fileDiffText={null}
          originalContent={null}
          openFiles={[makeOpenFile({ path: '/repo/readme.md', content: '# Hello' })]}
          activeFilePath="/repo/readme.md"
          fileContent="# Hello"
          lastFileOpenRequest={makeOpenRequest({ path: '/repo/readme.md' })}
          theme="vs-dark"
          onActivatePane={() => setActivations((value) => value + 1)}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onSaveFile={vi.fn()}
        />
      )
    }

    render(<Wrapper />)

    // Markdown files auto-open in preview mode
    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Hello')
    })
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
          theme="vs-dark"
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
          theme="vs-dark"
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

  it('invokes split-right action from the compact split menu', () => {
    const onSplitPane = vi.fn()

    renderViewer({
      onSplitPane,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Split editor' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split right' }))

    expect(onSplitPane).toHaveBeenCalledWith('right')
  })

  it('invokes split-down action from the compact split menu', () => {
    const onSplitPane = vi.fn()

    renderViewer({
      onSplitPane,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Split editor' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split down' }))

    expect(onSplitPane).toHaveBeenCalledWith('below')
  })
})
