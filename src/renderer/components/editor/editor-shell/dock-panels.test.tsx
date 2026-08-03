import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { PANEL_COMPONENTS } from './dock-panels'
import { siblingPanelId } from '../../../hooks/agent-session/agent-siblings'
import type { DraftId } from '../../../../shared/draft-chat'

vi.mock('../../terminal/TerminalPane', () => ({
  TerminalPane: ({ sessionId, label }: { sessionId: string; label: string }) => (
    <div>{`terminal:${label}:${sessionId}`}</div>
  ),
}))

vi.mock('./AgentChatView', () => ({
  AgentChatView: ({ sessionId }: { sessionId: string }) => (
    <div>{`chat:${sessionId}`}</div>
  ),
}))

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
    getEditorPane: vi.fn(),
    lastFileOpenRequest: { path: null, source: 'default' },
    theme: 'dark',
    sidebarView: 'explorer',
    onSelectSidebarView: vi.fn(),
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
    worktreeShellSessionId: null,
    projectShellSessionId: null,
    worktreeCwd: null,
    baseBranch: 'main',
    defaultRuntime: 'codex',
    defaultAgentMode: 'interactive',
    activeProjectIsGit: true,
    activeSessionWorktreePath: null,
    activeSessionNoWorktree: false,
    onLaunchWorkspaceAgent: vi.fn(),
    workspaces: [{ id: 'ws-1', name: 'kong-gateway', projectIds: ['p1'], createdAt: '2024-01-01' }],
    activeWorkspaceId: 'ws-1',
    projects: [{ id: 'p1', name: 'kong-gateway', path: '/repos/kong-gateway', baseBranch: 'main', addedAt: '2024-01-01' }],
    activeProjectId: null,
    allProjectSessions: {
      p1: [
        {
          id: 'child-1',
          projectId: 'p1',
          runtimeId: 'codex',
          branchName: 'manifold/123',
          worktreePath: '/worktrees/kong-gateway/manifold-123',
          status: 'running',
          pid: 1,
          additionalDirs: [],
          workspaceId: 'ws-1',
        },
      ],
    },
    outputtingSessionIds: new Set<string>(),
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
    onResumeAgent: vi.fn(),    onFocusSearch: vi.fn(),
    onClosePanel: vi.fn(),
    onOpenModule: vi.fn(),
    isModuleOpen: () => false,
    onFocusPanel: vi.fn(),
    onOpenSibling: vi.fn(),
    onCloseSiblingPanel: vi.fn(),
    drafts: [],
    activeDraft: null,
    promoteDraft: vi.fn(async () => {}),
    discardDraft: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
}

describe('AgentPanel', () => {
  it('renders a child session terminal for sibling child panels', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState()}>
        <AgentPanel api={{ id: siblingPanelId('child-1') }} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('terminal:Agent:child-1')).toBeInTheDocument()
  })

  // The empty panel starts an agent in the workspace, and offers the workspace's
  // own finished agents to resume — an agent is never scoped to a folder.
  it('surfaces the workspace dormant agents in the no-agent view', async () => {
    mockInvoke.mockResolvedValue([
      { id: 'codex', name: 'Codex', installed: true },
    ])
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState({
        activeProjectId: 'p1',
        activeProjectIsGit: true,
        allProjectSessions: {
          p1: [
            {
              id: 'dormant-1',
              projectId: 'p1',
              runtimeId: 'codex',
              branchName: 'manifold/dormant-worktree',
              worktreePath: '/worktrees/kong-gateway/manifold-dormant',
              status: 'done',
              pid: null,
              additionalDirs: [],
              workspaceId: 'ws-1',
            },
          ],
        },
      })}
      >
        <AgentPanel />
      </DockStateContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Agents you can resume')).toBeInTheDocument()
    })
    expect(screen.getByText('Start Terminal')).toBeInTheDocument()
    expect(screen.getByText('Worktree: manifold-dormant')).toBeInTheDocument()
    expect(screen.getByText('Agent: Codex')).toBeInTheDocument()
  })

  it('renders AgentChatView when the target session is nonInteractive', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState({
        activeProjectId: 'p1',
        sessionId: 'chat-1',
        primarySessionId: 'chat-1',
        allProjectSessions: {
          p1: [
            {
              id: 'chat-1',
              projectId: 'p1',
              runtimeId: 'claude',
              branchName: 'manifold/oslo',
              worktreePath: '/worktrees/kong-gateway/manifold-oslo',
              status: 'running',
              pid: 2,
              additionalDirs: [],
              nonInteractive: true,
            },
          ],
        },
      })}>
        <AgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('chat:chat-1')).toBeInTheDocument()
    expect(screen.queryByText(/^terminal:Agent:/)).toBeNull()
  })

  it('renders terminal for interactive sessions (regression guard)', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState({
        activeProjectId: 'p1',
        sessionId: 'int-1',
        primarySessionId: 'int-1',
        allProjectSessions: {
          p1: [
            {
              id: 'int-1',
              projectId: 'p1',
              runtimeId: 'claude',
              branchName: 'manifold/bergen',
              worktreePath: '/worktrees/kong-gateway/manifold-bergen',
              status: 'running',
              pid: 3,
              additionalDirs: [],
            },
          ],
        },
      })}>
        <AgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('terminal:Agent:int-1')).toBeInTheDocument()
    expect(screen.queryByText(/^chat:/)).toBeNull()
  })

  it('renders DraftChatView when an activeDraft is set', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState({
        activeProjectId: 'p1',
        activeDraft: { id: 'draft-1' as DraftId, projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo' },
      })}>
        <AgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
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
          path: filePath,
          source: 'sourceControl',
          scm: { workspaceId: 'ws-1', projectId: 'p1', relPath: 'src/app.ts' },
        },
      })}
      >
        <EditorPanel api={{ id: 'editor' }} />
      </DockStateContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('monaco-diff-editor')).toHaveTextContent('old content → new content')
    })
    expect(mockInvoke).toHaveBeenCalledWith('git:workspace-file-diff', 'ws-1', 'p1', 'src/app.ts')
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
          path: filePath,
          source: 'sourceControl',
          scm: { workspaceId: 'ws-1', projectId: 'p1', relPath: 'src/app.ts' },
        },
      })}
      >
        <EditorPanel api={{ id: 'editor' }} />
      </DockStateContext.Provider>,
    )

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-file-diff', 'ws-1', 'p1', 'src/app.ts')
    })
    expect(screen.queryByTestId('monaco-diff-editor')).not.toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('new content')
  })
})

describe('SidebarPanel', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue([])
  })

  function renderSidebar(sidebarView: DockAppState['sidebarView']): void {
    const SidebarPanel = PANEL_COMPONENTS.sidebar
    render(
      <DockStateContext.Provider value={makeDockState({
        sidebarView,
        workspaces: [],
        activeWorkspaceId: null,
        favorites: [],
      })}
      >
        <SidebarPanel />
      </DockStateContext.Provider>,
    )
  }

  it('shows the Explorer by default', () => {
    renderSidebar('explorer')

    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })

  // Switching views must REPLACE what the sidebar shows, not stack another view
  // into the same column — the whole point of the one-view-at-a-time sidebar.
  it('replaces the Explorer with Source Control when that view is selected', () => {
    renderSidebar('sourceControl')

    expect(screen.queryByText('Workspaces')).not.toBeInTheDocument()
    expect(screen.getByText('No workspace selected')).toBeInTheDocument()
  })

  it('shows Search inline, with no modal chrome', () => {
    renderSidebar('search')

    expect(screen.queryByText('Workspaces')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })
})
