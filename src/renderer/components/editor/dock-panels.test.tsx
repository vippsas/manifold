import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { PANEL_COMPONENTS } from './dock-panels'
import { siblingPanelId } from '../../hooks/agent-siblings'

vi.mock('../terminal/TerminalPane', () => ({
  TerminalPane: ({ sessionId, label }: { sessionId: string; label: string }) => (
    <div>{`terminal:${label}:${sessionId}`}</div>
  ),
}))

vi.mock('./SuperagentAgentPanel', () => ({
  SuperagentAgentPanel: () => <div>superagent-panel</div>,
  restartOverlayStyles: {},
}))

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
    getEditorPane: vi.fn(),
    lastFileOpenRequest: { path: null, source: 'default' },
    theme: 'dark',
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
    baseBranch: 'main',
    defaultRuntime: 'codex',
    activeSessionWorktreePath: null,
    activeSessionNoWorktree: false,
    onLaunchAgent: vi.fn(),
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
          parentSuperagentId: 'sa-1',
        },
      ],
    },
    outputtingSessionIds: new Set<string>(),
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onRequestDeleteAgent: vi.fn(),
    onNewAgentFromHeader: vi.fn(),
    newAgentFocusTrigger: 0,
    onNewProject: vi.fn(),
    superagents: [{
      id: 'sa-1',
      name: '123',
      taskDescription: '',
      runtimeId: 'codex',
      fleetProjectIds: ['p1'],
      fleetWorktreePaths: { p1: '/worktrees/kong-gateway/manifold-123' },
      branchName: 'manifold/123',
      childSessionIds: ['child-1'],
      coordinationPath: '/coordination',
      createdAt: '2024-01-01T00:00:00.000Z',
      pid: 10,
      status: 'running',
      autoApprove: false,
    }],
    activeSuperagentId: 'sa-1',
    activeSuperagent: null,
    onSelectSuperagent: vi.fn(),
    onResumeSuperagent: vi.fn(),
    onRemoveSuperagent: vi.fn(),
    onSpawnFleetAgent: vi.fn(),
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
    onFocusPanel: vi.fn(),
    onOpenSibling: vi.fn(),
    onCloseSiblingPanel: vi.fn(),
    ...overrides,
  }
}

describe('AgentPanel in superagent mode', () => {
  it('renders a child session terminal for sibling child panels without leaving superagent mode', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState()}>
        <AgentPanel api={{ id: siblingPanelId('child-1') }} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('terminal:Agent:child-1')).toBeInTheDocument()
    expect(screen.queryByText('superagent-panel')).toBeNull()
  })
})
