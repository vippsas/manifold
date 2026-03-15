import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { OpenFile } from '../../hooks/useCodeView'

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')

  function MockEditor({ value }: { value: string }): React.JSX.Element {
    const [initialValue] = React.useState(value)
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

import { CodeViewer } from './CodeViewer'

function makeOpenFile(
  overrides: Partial<OpenFile> = {},
): OpenFile {
  return {
    path: '/repo/file.ts',
    content: 'const value = 1',
    refreshVersion: 0,
    ...overrides,
  }
}

describe('CodeViewer', () => {
  const baseProps = {
    sessionId: 'session-1',
    fileDiffText: null,
    originalContent: null,
    theme: 'vs-dark',
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onSaveFile: vi.fn(),
  }

  it('remounts the editor when an open file is refreshed from disk', () => {
    const openFile = makeOpenFile()
    const { rerender } = render(
      <CodeViewer
        {...baseProps}
        openFiles={[openFile]}
        activeFilePath={openFile.path}
        fileContent={openFile.content}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('const value = 1')

    const refreshedFile = makeOpenFile({
      content: 'const value = 2',
      refreshVersion: 1,
    })

    rerender(
      <CodeViewer
        {...baseProps}
        openFiles={[refreshedFile]}
        activeFilePath={refreshedFile.path}
        fileContent={refreshedFile.content}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('const value = 2')
  })

  it('remounts the diff editor when an open file is refreshed from disk', async () => {
    const openFile = makeOpenFile()
    const { rerender } = render(
      <CodeViewer
        {...baseProps}
        fileDiffText="diff --git a/file.ts b/file.ts"
        originalContent="const value = 0"
        openFiles={[openFile]}
        activeFilePath={openFile.path}
        fileContent={openFile.content}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('const value = 1')
    })

    const refreshedFile = makeOpenFile({
      content: 'const value = 2',
      refreshVersion: 1,
    })

    rerender(
      <CodeViewer
        {...baseProps}
        fileDiffText="diff --git a/file.ts b/file.ts"
        originalContent="const value = 0"
        openFiles={[refreshedFile]}
        activeFilePath={refreshedFile.path}
        fileContent={refreshedFile.content}
      />,
    )

    expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('const value = 2')
  })
})
