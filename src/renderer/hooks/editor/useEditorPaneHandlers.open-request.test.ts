import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorPaneHandlers } from './useEditorPaneHandlers'

const scm = { workspaceId: 'workspace', projectId: 'project', relPath: 'a.tf', staged: false }

function setup(splitPaneId: string | null = null) {
  const args: Parameters<typeof useEditorPaneHandlers>[0] = {
    activeSessionId: null,
    activeProjectId: null,
    primarySessionId: null,
    sessionsByProject: {},
    projects: [],
    restoredSessionId: null,
    codeView: {
      activeEditorPaneId: 'editor',
      handleSelectFile: vi.fn(() => 'editor-target'),
      setActivePane: vi.fn(),
      createPane: vi.fn(),
      moveFileToPane: vi.fn(),
      removePane: vi.fn(),
    },
    dockLayout: {
      splitEditorPane: vi.fn(() => splitPaneId),
      focusPanel: vi.fn(),
      closePanel: vi.fn(),
      editorPanelIds: ['editor'],
      findEditorPanelForSplit: vi.fn(() => null),
    },
    ensureEditorVisible: vi.fn(() => 'editor'),
    handleSelectFile: vi.fn(() => 'editor-target'),
    setActiveSession: vi.fn(),
    onRequestDeleteAgent: vi.fn(),
  }
  return { ...renderHook(() => useEditorPaneHandlers(args)), args }
}

describe('editor file-open request targeting', () => {
  it.each(['default', 'fileTree', 'sourceControl', 'search'] as const)(
    'records the pane that actually handled a %s open',
    (source) => {
      const { result } = setup()
      act(() => {
        if (source === 'default') result.current.handleSelectFileWithDefaultView('/a.tf')
        if (source === 'fileTree') result.current.handleSelectFileFromFileTree('/a.tf')
        if (source === 'sourceControl') result.current.handleSelectFileFromSourceControl('/a.tf', scm)
        if (source === 'search') result.current.handleOpenSearchResult({ path: '/a.tf', line: 12, column: 3 })
      })
      expect(result.current.lastFileOpenRequest).toMatchObject({ paneId: 'editor-target', path: '/a.tf', source })
      if (source === 'sourceControl') expect(result.current.lastFileOpenRequest.scm).toEqual(scm)
      if (source === 'search') expect(result.current.lastFileOpenRequest).toMatchObject({ line: 12, column: 3 })
    },
  )

  it.each(['editor-split', null])('targets a split search open or its fallback (%s)', (splitPaneId) => {
    const { result, args } = setup(splitPaneId)
    act(() => { result.current.handleOpenSearchResultInSplit({ path: '/a.tf', line: 12, column: 3 }) })
    expect(result.current.lastFileOpenRequest).toEqual({
      paneId: 'editor-target', path: '/a.tf', source: 'search', line: 12, column: 3,
    })
    if (splitPaneId) expect(args.codeView.handleSelectFile).toHaveBeenCalledWith('/a.tf', splitPaneId)
    else expect(args.handleSelectFile).toHaveBeenCalledWith('/a.tf')
  })

  it('targets a markdown link at the pane that opened it', () => {
    const { result, args } = setup()
    act(() => { result.current.handleSelectFileFromMarkdownPreview('/a.tf', 'editor') })
    expect(args.codeView.handleSelectFile).toHaveBeenCalledWith('/a.tf', 'editor')
    expect(result.current.lastFileOpenRequest).toEqual({ paneId: 'editor-target', path: '/a.tf', source: 'markdownPreview' })
  })
})
