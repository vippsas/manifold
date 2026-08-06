import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { EditorPaneActions } from './EditorPaneActions'
import type { EditorPaneModeControls } from '../editor-pane-mode-controls'
import { registerEditorPaneModeControls, unregisterEditorPaneModeControls } from '../editor-pane-mode-controls'

function makeDockState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: 'session-1',
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
    onSelectScmFile: vi.fn(),
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
    baseBranch: 'main',
    defaultRuntime: 'codex',
    defaultAgentMode: 'interactive',
    onLaunchAgent: vi.fn(),
    projects: [],
    activeProjectId: null,
    allProjectSessions: {},
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onRenameAgent: vi.fn(),
    onRequestDeleteAgent: vi.fn(),
    onNewAgentFromHeader: vi.fn(),
    onNewProject: vi.fn(),
    activeSessionStatus: null,
    activeSessionRuntimeId: null,
    onResumeAgent: vi.fn(),
    onFocusSearch: vi.fn(),
    onClosePanel: vi.fn(),
    onOpenModule: vi.fn(),
    isModuleOpen: () => false,
    onFocusPanel: vi.fn(),
    onOpenSibling: vi.fn(),
    onCloseSiblingPanel: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
}

function renderHeaderActions(stateOverrides: Partial<DockAppState> = {}, paneId = 'editor') {
  return render(
    <DockStateContext.Provider value={makeDockState(stateOverrides)}>
      <EditorPaneActions paneId={paneId} />
    </DockStateContext.Provider>,
  )
}

describe('EditorPaneActions', () => {
  it('shows the current mode and toggles to the next view on one click', () => {
    const showPreview = vi.fn()
    const controls: EditorPaneModeControls = {
      canShowPreview: true,
      canShowDiff: false,
      mode: 'editor',
      showEditor: vi.fn(),
      showPreview,
      showDiff: vi.fn(),
    }
    registerEditorPaneModeControls('editor', controls)

    const { unmount } = renderHeaderActions()

    // A single button shows the current mode and advertises the next one.
    const toggle = screen.getByRole('button', { name: 'Editor' })
    expect(toggle).toHaveAttribute('title', 'Switch to Preview')
    // One click switches to Preview.
    fireEvent.click(toggle)
    expect(showPreview).toHaveBeenCalledTimes(1)

    unmount()
    unregisterEditorPaneModeControls('editor', controls)
  })

  it('invokes split-right from the pane action menu', () => {
    const onSplitEditorPane = vi.fn()

    renderHeaderActions({ onSplitEditorPane })

    fireEvent.click(screen.getByRole('button', { name: 'Pane actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split right' }))

    expect(onSplitEditorPane).toHaveBeenCalledWith('editor', 'right')
  })

  it('moves the active file to another editor from the pane action menu', () => {
    const onMoveFileToPane = vi.fn()

    renderHeaderActions({ onMoveFileToPane })

    fireEvent.click(screen.getByRole('button', { name: 'Pane actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move file to Editor 2' }))

    expect(onMoveFileToPane).toHaveBeenCalledWith('/repo/file.ts', 'editor:1', 'editor')
  })

  it('cycles editor → preview → diff → editor when all three views exist', () => {
    const showEditor = vi.fn()
    const showPreview = vi.fn()
    const showDiff = vi.fn()
    const base = { canShowPreview: true, canShowDiff: true, showEditor, showPreview, showDiff }

    // editor → preview
    let controls: EditorPaneModeControls = { ...base, mode: 'editor' }
    registerEditorPaneModeControls('editor', controls)
    let view = renderHeaderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
    expect(showPreview).toHaveBeenCalledTimes(1)
    view.unmount()
    unregisterEditorPaneModeControls('editor', controls)

    // preview → diff
    controls = { ...base, mode: 'preview' }
    registerEditorPaneModeControls('editor', controls)
    view = renderHeaderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(showDiff).toHaveBeenCalledTimes(1)
    view.unmount()
    unregisterEditorPaneModeControls('editor', controls)

    // diff → editor (wraps around)
    controls = { ...base, mode: 'diff' }
    registerEditorPaneModeControls('editor', controls)
    view = renderHeaderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }))
    expect(showEditor).toHaveBeenCalledTimes(1)
    view.unmount()
    unregisterEditorPaneModeControls('editor', controls)
  })

  it('does not render for a pane that is not an editor', () => {
    renderHeaderActions({}, 'shell')

    expect(screen.queryByRole('button', { name: 'Pane actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editor' })).toBeNull()
  })
})
