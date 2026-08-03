// The + in the agent group's tab bar is where a new agent is added: it spawns
// straight into the active workspace and shows up as another agent tab.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { AgentHeaderActions } from './AgentHeaderActions'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue([
    { id: 'claude', name: 'Claude Code', installed: true },
    { id: 'codex', name: 'Codex', installed: false },
  ])
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function makeState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: null,
    workspaces: [
      { id: 'w1', name: 'checkout', projectIds: ['p1'], createdAt: '2024-01-01' },
    ],
    activeWorkspaceId: 'w1',
    activeProjectId: 'p1',
    allProjectSessions: {},
    projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
    onLaunchWorkspaceAgent: vi.fn(async () => null),
    onRenameAgent: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
}

function renderActions(state: DockAppState, panelIds: string[]): void {
  const props = { panels: panelIds.map((id) => ({ id })) } as unknown as IDockviewHeaderActionsProps
  render(
    <DockStateContext.Provider value={state}>
      <AgentHeaderActions {...props} />
    </DockStateContext.Provider>,
  )
}

describe('AgentHeaderActions', () => {
  it('renders nothing for a group without agent tabs', () => {
    renderActions(makeState(), ['shell', 'editor'])

    expect(screen.queryByLabelText(/New agent in/)).not.toBeInTheDocument()
  })

  it('spawns a terminal agent into the active workspace from the + menu', async () => {
    const state = makeState()
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))
    await waitFor(() => expect(screen.getByText('New Claude Terminal')).toBeInTheDocument())
    // Only installed runtimes are offered.
    expect(screen.queryByText(/Codex/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('New Claude Terminal'))

    expect(state.onLaunchWorkspaceAgent).toHaveBeenCalledWith('w1', 'p1', {
      runtimeId: 'claude', prompt: '', nonInteractive: false,
    })
  })

  it('spawns a chat agent when the Chat item is picked', async () => {
    const state = makeState()
    renderActions(state, ['agent:s7'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))
    await waitFor(() => expect(screen.getByText('New Claude Chat')).toBeInTheDocument())
    fireEvent.click(screen.getByText('New Claude Chat'))

    expect(state.onLaunchWorkspaceAgent).toHaveBeenCalledWith('w1', 'p1', {
      runtimeId: 'claude', prompt: '', nonInteractive: true,
    })
  })

  it('falls back to the workspace holding the active repo when none is focused', async () => {
    const state = makeState({ activeWorkspaceId: null })
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))
    await waitFor(() => expect(screen.getByText('New Claude Terminal')).toBeInTheDocument())
    fireEvent.click(screen.getByText('New Claude Terminal'))

    expect(state.onLaunchWorkspaceAgent).toHaveBeenCalledWith('w1', 'p1', expect.anything())
  })

  it('offers agent settings for the active agent', () => {
    const state = makeState({
      sessionId: 's1',
      allProjectSessions: {
        p1: [{
          id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'main',
          worktreePath: '/repos/alpha', status: 'running', pid: 1, additionalDirs: [],
        }],
      },
    } as unknown as Partial<DockAppState>)
    renderActions(state, ['agent'])

    expect(screen.getByLabelText('Agent settings')).toBeInTheDocument()
  })
})
