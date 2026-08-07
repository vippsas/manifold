import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockTab } from './DockTab'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import { siblingPanelId } from './hooks/agent-session/agent-siblings'
import type { AgentSession } from '../shared/types'

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
    onSelectScmFile: () => {},
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
    onNewProject: () => {},
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

  it('double-clicking the tab toggles focus mode for that pane', () => {
    const onToggleMaximize = vi.fn()
    render(
      <DockStateContext.Provider value={makeDockState({ onToggleMaximize })}>
        <DockTab {...makeHeaderProps('agent', 'Claude')} />
      </DockStateContext.Provider>,
    )

    fireEvent.doubleClick(screen.getByText('Claude'))

    expect(onToggleMaximize).toHaveBeenCalledTimes(1)
    expect(onToggleMaximize).toHaveBeenCalledWith('agent')
  })

  it('does not toggle focus mode when a non-agent tab close is double-clicked', () => {
    const onToggleMaximize = vi.fn()
    const onClosePanel = vi.fn()
    render(
      <DockStateContext.Provider value={makeDockState({ onToggleMaximize, onClosePanel })}>
        <DockTab {...makeHeaderProps('memory', 'Memory')} />
      </DockStateContext.Provider>,
    )

    fireEvent.doubleClick(screen.getByTitle('Close Memory'))

    expect(onToggleMaximize).not.toHaveBeenCalled()
  })

  const agentSession: AgentSession = {
    id: 'child-1', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/test',
    worktreePath: '/wt', status: 'running', pid: 1, additionalDirs: [], workspaceId: 'ws-1',
  }

  it('gives an agent tab settings + delete instead of a close, and deletes on 🗑', () => {
    const onRequestDeleteAgent = vi.fn()
    render(
      <DockStateContext.Provider value={makeDockState({
        onRequestDeleteAgent,
        projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
        allProjectSessions: { p1: [agentSession] },
      } as unknown as Partial<DockAppState>)}>
        <DockTab {...makeHeaderProps(siblingPanelId('child-1'), 'k8s-app-conf')} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByLabelText('Settings for k8s-app-conf')).toBeInTheDocument()
    expect(screen.queryByTitle('Close k8s-app-conf')).toBeNull()

    fireEvent.click(screen.getByLabelText('Delete k8s-app-conf'))
    expect(onRequestDeleteAgent).toHaveBeenCalledWith(agentSession, '/repos/alpha')
  })

  it('does not toggle focus mode when an agent tab action is double-clicked', () => {
    const onToggleMaximize = vi.fn()
    render(
      <DockStateContext.Provider value={makeDockState({
        onToggleMaximize,
        allProjectSessions: { p1: [agentSession] },
      })}>
        <DockTab {...makeHeaderProps(siblingPanelId('child-1'), 'k8s-app-conf')} />
      </DockStateContext.Provider>,
    )

    fireEvent.doubleClick(screen.getByLabelText('Delete k8s-app-conf'))
    expect(onToggleMaximize).not.toHaveBeenCalled()
  })

  it('gives the empty primary agent tab a label but no actions or close', () => {
    render(
      <DockStateContext.Provider value={makeDockState({ primarySessionId: null })}>
        <DockTab {...makeHeaderProps('agent', 'Agent')} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.queryByTitle('Close Agent')).toBeNull()
    expect(screen.queryByLabelText('Delete Agent')).toBeNull()
  })

  it('gives the sidebar group no tab of its own', () => {
    const { container } = render(<DockTab {...makeHeaderProps('sidebar', 'Sidebar')} />)

    // Which view the sidebar shows is already said by the active activity-bar
    // icon, and a lone tab switches nothing.
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.queryByText('Sidebar')).toBeNull()
    expect(container.querySelector('.dock-tab--headless')).not.toBeNull()
  })

  it('renders the editor as an icon-only tab without a close button', () => {
    const { container } = render(<DockTab {...makeHeaderProps('editor', 'Editor')} />)

    // Name is a tooltip, not a text label; no per-tab close — the group header
    // carries a single × for the whole item.
    expect(screen.getByTitle('Editor')).toBeInTheDocument()
    expect(screen.queryByText('Editor')).toBeNull()
    expect(screen.queryByTitle('Close Editor')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('double-clicking an icon-only tab still toggles focus mode', () => {
    const onToggleMaximize = vi.fn()
    render(
      <DockStateContext.Provider value={makeDockState({ onToggleMaximize })}>
        <DockTab {...makeHeaderProps('editor', 'Editor')} />
      </DockStateContext.Provider>,
    )

    fireEvent.doubleClick(screen.getByTitle('Editor'))

    expect(onToggleMaximize).toHaveBeenCalledWith('editor')
  })

  it('shows no workspace role pill on workspace child tabs', () => {
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

    expect(screen.queryByTitle('Workspace')).toBeNull()
    expect(screen.getByText('k8s-app-conf')).toBeInTheDocument()
  })
})
