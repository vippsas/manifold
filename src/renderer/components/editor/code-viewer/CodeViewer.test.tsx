import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CodeViewer } from './CodeViewer'
import { getEditorPaneModeControls } from '../editor-pane-mode-controls'
import { makeOpenFile, makeOpenRequest, renderViewer } from './CodeViewer.test-helpers'

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')
  let editorMountId = 0

  function MockEditor({
    value,
    defaultValue,
    onChange,
  }: {
    value?: string
    defaultValue?: string
    onChange?: (value: string | undefined) => void
  }): React.JSX.Element {
    const [mountId] = React.useState(() => ++editorMountId)
    const currentValue = value ?? defaultValue
    return (
      <div
        data-testid="monaco-editor"
        data-mount-id={mountId}
        onClick={() => onChange?.(`${currentValue}x`)}
      >
        {currentValue}
      </div>
    )
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

describe('CodeViewer — editor & diff', () => {
  it('updates a refreshed file without remounting the editor', () => {
    const openFile = makeOpenFile()
    const { rerender } = renderViewer({
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
    })

    const editor = screen.getByTestId('monaco-editor')
    const mountId = editor.dataset.mountId
    expect(editor).toHaveTextContent('const value = 1')

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
        theme="manifold-dark"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSaveFile={vi.fn()}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('const value = 2')
    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-mount-id', mountId)
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
        theme="manifold-dark"
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

  it('stays in editor when an edit makes diff data available', () => {
    const openFile = makeOpenFile({
      path: '/repo/src/index.ts',
      content: 'const value = 1',
    })
    const lastFileOpenRequest = makeOpenRequest({
      path: openFile.path,
      source: 'default',
    })
    const { rerender } = renderViewer({
      openFiles: [openFile],
      activeFilePath: openFile.path,
      fileContent: openFile.content,
      lastFileOpenRequest,
    })

    fireEvent.click(screen.getByTestId('monaco-editor'))

    rerender(
      <CodeViewer
        sessionId="session-1"
        fileDiffText="diff --git a/src/index.ts b/src/index.ts"
        originalContent="const value = 1"
        openFiles={[openFile]}
        activeFilePath={openFile.path}
        fileContent={`${openFile.content}x`}
        lastFileOpenRequest={lastFileOpenRequest}
        theme="manifold-dark"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onSaveFile={vi.fn()}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('monaco-diff-editor')).not.toBeInTheDocument()
  })

  it('keeps preview button working when pane activation triggers a rerender', async () => {
    function Wrapper(): React.JSX.Element {
      const [, setActivations] = React.useState(0)

      return (
        <CodeViewer
          sessionId="session-1"
          fileDiffText={null}
          originalContent={null}
          openFiles={[makeOpenFile({ path: '/repo/readme.md', content: '# Hello' })]}
          activeFilePath="/repo/readme.md"
          fileContent="# Hello"
          lastFileOpenRequest={makeOpenRequest({ path: '/repo/readme.md' })}
          theme="manifold-dark"
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
})

describe('CodeViewer image rendering', () => {
  it('renders an <img> with the data URL when the active file is an image', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    renderViewer({
      openFiles: [makeOpenFile({ path: '/repo/logo.png', content: dataUrl })],
      activeFilePath: '/repo/logo.png',
      fileContent: dataUrl,
    })

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', dataUrl)
    expect(screen.queryByTestId('monaco-editor')).toBeNull()
  })

  it('does not register preview or diff controls for image files', () => {
    const dataUrl = 'data:image/png;base64,AA'
    renderViewer({
      paneId: 'editor-image-test',
      openFiles: [makeOpenFile({ path: '/repo/logo.png', content: dataUrl })],
      activeFilePath: '/repo/logo.png',
      fileContent: dataUrl,
      fileDiffText: 'diff --git a/foo b/foo\n',
    })

    const controls = getEditorPaneModeControls('editor-image-test')
    expect(controls?.canShowPreview).toBe(false)
    expect(controls?.canShowDiff).toBe(false)
  })
})
