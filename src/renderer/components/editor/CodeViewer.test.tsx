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
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown-preview">{children}</div>
  ),
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

    fireEvent.click(screen.getByTitle('Show preview'))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Hello')
    })
  })

  it('invokes split action when clicked', () => {
    const onSplitPane = vi.fn()

    renderViewer({
      onSplitPane,
    })

    fireEvent.click(screen.getByTitle('Split editor vertically'))

    expect(onSplitPane).toHaveBeenCalledWith('right')
  })
})
