import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockTab } from './DockTab'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import { siblingPanelId } from './hooks/agent-siblings'

function makeHeaderProps(id: string, title: string): IDockviewPanelHeaderProps {
  return {
    api: {
      id,
      title,
      onDidTitleChange: () => ({ dispose: () => {} }),
    } as unknown as IDockviewPanelHeaderProps['api'],
  } as IDockviewPanelHeaderProps
}

function makeDockState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: null,
    primarySessionId: null,
    searchFocusRequestKey: 0,
    requestedSearchMode: null,
    scrollbackLines: 1000,
    diffText: '',
    openFiles: [],
    activeFilePath: null,
    activeEditorPaneId: null,
    editorPaneIds: [],
    getEditorPane: (() => { throw new Error('not implemented') }) as DockAppState['getEditorPane'],
    lastFileOpenRequest: { path: null, source: 'default' },
    theme: 'dark',
    onSelectFile: () => {},
    onOpenSearchResult: () => {},
    onOpenSearchResultInSplit: () => {},
    onSelectFileFromFileTree: () => {},
    onSelectOpenFile: () => {},
    onSelectFileFromMarkdownPreview: () => {},
    onCloseFile: () => {},
    onSaveFile: () => {},
    onRegisterEditorPane: () => {},
    onActivateEditorPane: () => {},
    onSplitEditorPane: () => {},
    onMoveFileToPane: () => {},
    onMoveFileToSplitPane: () => {},
    tree: null,
    primaryBranch: null,
    changes: [],
    expandedPaths: new Set<string>(),
    onToggleExpand: () => {},
    worktreeRoot: null,
    worktreeShellSessionId: null,
    projectShellSessionId: null,
    worktreeCwd: null,
    baseBranch: 'main',
    activeProjectIsGit: true,
    defaultRuntime: 'codex',
    defaultAgentMode: 'interactive',
    activeSessionWorktreePath: null,
    activeSessionNoWorktree: false,
    onLaunchAgent: async () => null,
    projects: [],
    activeProjectId: null,
    allProjectSessions: {},
    outputtingSessionIds: new Set<string>(),
    onSelectProject: () => {},
    onSelectSession: () => {},
    onRemoveProject: () => {},
    onUpdateProject: () => {},
    onRenameAgent: () => {},
    onRequestDeleteAgent: () => {},
    onNewAgentFromHeader: () => {},
    newAgentFocusTrigger: 0,
    onNewProject: () => {},
    fetchingProjectId: null,
    lastFetchedProjectId: null,
    fetchResult: null,
    fetchError: null,
    onFetchProject: () => {},
    activeSessionStatus: null,
    activeSessionRuntimeId: null,
    onResumeAgent: async () => {},
    onFocusSearch: () => {},
    onClosePanel: () => {},
    onOpenModule: () => {},
    isModuleOpen: () => false,
    onFocusPanel: () => {},
    onOpenSibling: () => {},
    onCloseSiblingPanel: () => {},
    ...overrides,
  } as unknown as DockAppState
}

describe('DockTab', () => {
  it('keeps shell-specific actions out of the Shell dock tab', () => {
    render(<DockTab {...makeHeaderProps('shell', 'Shell')} />)

    expect(screen.getByText('Shell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New shell tab' })).toBeNull()
  })

  it('collapses the matching sidebar from each sidebar tab, but shows no collapse button elsewhere', () => {
    const onCollapseSidebar = vi.fn()

    const { rerender } = render(
      <DockStateContext.Provider value={makeDockState({ onCollapseSidebar })}>
        <DockTab {...makeHeaderProps('projects', 'Repositories')} />
      </DockStateContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Repositories' }))
    expect(onCollapseSidebar).toHaveBeenLastCalledWith('left')

    rerender(
      <DockStateContext.Provider value={makeDockState({ onCollapseSidebar })}>
        <DockTab {...makeHeaderProps('fileTree', 'Files')} />
      </DockStateContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Files' }))
    expect(onCollapseSidebar).toHaveBeenLastCalledWith('right')

    rerender(
      <DockStateContext.Provider value={makeDockState({ onCollapseSidebar })}>
        <DockTab {...makeHeaderProps('agent', 'Agent')} />
      </DockStateContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: /^Collapse / })).toBeNull()
  })

  it('shows a compact workspace role pill on workspace child tabs', () => {
    render(
      <DockStateContext.Provider value={makeDockState({
        allProjectSessions: {
          p1: [{
            id: 'child-1',
            projectId: 'p1',
            runtimeId: 'codex',
            branchName: 'manifold/test',
            worktreePath: '/wt',
            status: 'running',
            pid: 1,
            additionalDirs: [],
            workspaceId: 'ws-1',
          }],
        },
      })}>
        <DockTab {...makeHeaderProps(siblingPanelId('child-1'), 'k8s-app-conf')} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByTitle('Workspace')).toHaveTextContent('W')
    expect(screen.getByText('k8s-app-conf')).toBeInTheDocument()
  })
})
