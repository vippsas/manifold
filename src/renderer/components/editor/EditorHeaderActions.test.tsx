import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { EditorHeaderActions } from './EditorHeaderActions'
import type { EditorPaneModeControls } from './editor-pane-mode-controls'
import { registerEditorPaneModeControls, unregisterEditorPaneModeControls } from './editor-pane-mode-controls'

function makeDockState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: 'session-1',
    searchFocusRequestKey: 0,
    requestedSearchMode: null,
    scrollbackLines: 1000,
    diffText: '',
    openFiles: [],
    activeFilePath: '/repo/file.ts',
    activeEditorPaneId: 'editor',
    editorPaneIds: ['editor', 'editor:1'],
    getEditorPane: (paneId: string) => ({
      id: paneId,
      openFiles: paneId === 'editor'
        ? [{ path: '/repo/file.ts', content: 'const value = 1', refreshVersion: 0 }]
        : [],
      activeFilePath: paneId === 'editor' ? '/repo/file.ts' : null,
      fileContent: paneId === 'editor' ? 'const value = 1' : null,
    }),
    lastFileOpenRequest: { path: null, source: 'default' },
    theme: 'manifold-dark',
    onSelectFile: vi.fn(),
    onOpenSearchResult: vi.fn(),
    onOpenSearchResultInSplit: vi.fn(),
    onSelectFileFromFileTree: vi.fn(),
    onSelectOpenFile: vi.fn(),
    onSelectFileFromMarkdownPreview: vi.fn(),
    onCloseFile: vi.fn(),
    onSaveFile: vi.fn(),
    onRegisterEditorPane: vi.fn(),
    onActivateEditorPane: vi.fn(),
    onSplitEditorPane: vi.fn(),
    onMoveFileToPane: vi.fn(),
    onMoveFileToSplitPane: vi.fn(),
    tree: null,
    primaryBranch: null,
    changes: [],
    expandedPaths: new Set<string>(),
    onToggleExpand: vi.fn(),
    worktreeRoot: null,
    worktreeShellSessionId: null,
    projectShellSessionId: null,
    worktreeCwd: null,
    shellBranchName: null,
    shellProjectName: null,
    baseBranch: 'main',
    defaultRuntime: 'codex',
    onLaunchAgent: vi.fn(),
    projects: [],
    activeProjectId: null,
    allProjectSessions: {},
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onDeleteAgent: vi.fn(),
    onNewAgentFromHeader: vi.fn(),
    newAgentFocusTrigger: 0,
    onNewProject: vi.fn(),
    fetchingProjectId: null,
    lastFetchedProjectId: null,
    fetchResult: null,
    fetchError: null,
    onFetchProject: vi.fn(),
    activeSessionStatus: null,
    activeSessionRuntimeId: null,
    onResumeAgent: vi.fn(),
    previewUrl: null,
    onShowSearchPanel: vi.fn(),
    onClosePanel: vi.fn(),
    ...overrides,
  }
}

function makeHeaderProps(overrides: Partial<IDockviewHeaderActionsProps> = {}): IDockviewHeaderActionsProps {
  return {
    api: {} as IDockviewHeaderActionsProps['api'],
    containerApi: {} as IDockviewHeaderActionsProps['containerApi'],
    panels: [],
    activePanel: { id: 'editor' } as IDockviewHeaderActionsProps['activePanel'],
    isGroupActive: true,
    group: {} as IDockviewHeaderActionsProps['group'],
    headerPosition: 'top',
    ...overrides,
  }
}

function renderHeaderActions(
  stateOverrides: Partial<DockAppState> = {},
  propsOverrides: Partial<IDockviewHeaderActionsProps> = {},
) {
  return render(
    <DockStateContext.Provider value={makeDockState(stateOverrides)}>
      <EditorHeaderActions {...makeHeaderProps(propsOverrides)} />
    </DockStateContext.Provider>,
  )
}

describe('EditorHeaderActions', () => {
  it('shows file mode actions in the dock header when preview or diff is available', () => {
    const showPreview = vi.fn()

    const controls: EditorPaneModeControls = {
      canShowPreview: true,
      canShowDiff: true,
      showEditor: vi.fn(),
      showPreview,
      showDiff: vi.fn(),
    }
    registerEditorPaneModeControls('editor', controls)

    const { unmount } = renderHeaderActions()

    fireEvent.click(screen.getByRole('button', { name: 'File mode options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }))

    expect(showPreview).toHaveBeenCalledTimes(1)

    unmount()
    unregisterEditorPaneModeControls('editor', controls)
  })

  it('invokes split-right from the dock header action menu', () => {
    const onSplitEditorPane = vi.fn()

    renderHeaderActions({ onSplitEditorPane })

    fireEvent.click(screen.getByRole('button', { name: 'Pane actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split right' }))

    expect(onSplitEditorPane).toHaveBeenCalledWith('editor', 'right')
  })

  it('moves the active file to another editor from the dock header action menu', () => {
    const onMoveFileToPane = vi.fn()

    renderHeaderActions({ onMoveFileToPane })

    fireEvent.click(screen.getByRole('button', { name: 'Pane actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move file to Editor 2' }))

    expect(onMoveFileToPane).toHaveBeenCalledWith('/repo/file.ts', 'editor:1', 'editor')
  })

  it('does not render for non-editor panels', () => {
    renderHeaderActions({}, {
      activePanel: { id: 'search' } as IDockviewHeaderActionsProps['activePanel'],
    })

    expect(screen.queryByRole('button', { name: 'Pane actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'File mode options' })).toBeNull()
  })
})
