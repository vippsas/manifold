import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { PANEL_COMPONENTS } from './dock-panels'
import { makeDockState } from './dock-panels.test-helpers'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, defaultValue }: { value?: string; defaultValue?: string }) => (
    <div data-testid="monaco-editor">{value ?? defaultValue}</div>
  ),
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="monaco-diff-editor">{`${original} → ${modified}`}</div>
  ),
}))

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

describe('EditorPanel — Source Control diff', () => {
  const filePath = '/worktrees/repo-one/src/app.ts'

  function editorState(overrides: Partial<DockAppState> = {}): DockAppState {
    return makeDockState({
      sessionId: null,
      diffText: '',
      worktreeRoot: null,
      getEditorPane: () => ({
        id: 'editor',
        openFiles: [{ path: filePath, content: 'new content', refreshVersion: 0 }],
        activeFilePath: filePath,
        fileContent: 'new content',
      }),
      onRegisterEditorPane: vi.fn(),
      ...overrides,
    })
  }

  it('shows the uncommitted diff for a file opened from Source Control', async () => {
    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'git:workspace-file-diff') {
        return { diff: 'diff --git a/src/app.ts b/src/app.ts', original: 'old content' }
      }
      return []
    })
    const EditorPanel = PANEL_COMPONENTS.editor

    render(
      <DockStateContext.Provider value={editorState({
        lastFileOpenRequest: {
          paneId: 'editor',
          path: filePath,
          source: 'sourceControl',
          scm: { workspaceId: 'ws-1', projectId: 'p1', relPath: 'src/app.ts', staged: false },
        },
      })}
      >
        <EditorPanel api={{ id: 'editor' }} />
      </DockStateContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('old content → new content')
    })
    expect(mockInvoke).toHaveBeenCalledWith('git:workspace-file-diff', 'ws-1', 'p1', 'src/app.ts', false)
  })

  it('stays in the plain editor when the checkout reports no uncommitted change', async () => {
    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'git:workspace-file-diff') return { diff: null, original: null }
      return []
    })
    const EditorPanel = PANEL_COMPONENTS.editor

    render(
      <DockStateContext.Provider value={editorState({
        lastFileOpenRequest: {
          paneId: 'editor',
          path: filePath,
          source: 'sourceControl',
          scm: { workspaceId: 'ws-1', projectId: 'p1', relPath: 'src/app.ts', staged: false },
        },
      })}
      >
        <EditorPanel api={{ id: 'editor' }} />
      </DockStateContext.Provider>,
    )

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-file-diff', 'ws-1', 'p1', 'src/app.ts', false)
    })
    expect(screen.queryByTestId('monaco-diff-editor')).not.toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('new content')
  })
})
