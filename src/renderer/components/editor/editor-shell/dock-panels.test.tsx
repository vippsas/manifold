import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { PANEL_COMPONENTS } from './dock-panels'
import { makeDockState } from './dock-panels.test-helpers'
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

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

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

  it('renders Viola through the normal agent chat panel', () => {
    const AgentPanel = PANEL_COMPONENTS.agent

    render(
      <DockStateContext.Provider value={makeDockState({
        activeProjectId: 'p1',
        sessionId: 'viola-1',
        primarySessionId: 'viola-1',
        allProjectSessions: {
          p1: [{
            id: 'viola-1',
            projectId: 'p1',
            runtimeId: 'viola',
            branchName: 'main',
            worktreePath: '/repos/kong-gateway',
            status: 'waiting',
            pid: null,
            additionalDirs: [],
            nonInteractive: true,
          }],
        },
      })}>
        <AgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('chat:viola-1')).toBeInTheDocument()
    expect(screen.queryByText(/^terminal:Agent:/)).toBeNull()
    expect(mockInvoke).not.toHaveBeenCalledWith('plugins:open-view', expect.anything())
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
