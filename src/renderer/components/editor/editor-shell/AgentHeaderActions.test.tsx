// The + in the agent group's tab bar is where a new agent is added: it opens the
// New Agent dialog on the active workspace, the same dialog the empty agent view
// and the command palette use.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { AgentHeaderActions } from './AgentHeaderActions'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue([])
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
    onNewAgentFromHeader: vi.fn(),
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

  it('opens the new agent dialog on the active workspace', () => {
    const state = makeState()
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onNewAgentFromHeader).toHaveBeenCalledWith('w1')
    // No runtime dropdown: the dialog owns the runtime/mode choice.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('offers the + from a sibling agent tab too', () => {
    const state = makeState()
    renderActions(state, ['agent:s7'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onNewAgentFromHeader).toHaveBeenCalledWith('w1')
  })

  it('falls back to the workspace holding the active repo when none is focused', () => {
    const state = makeState({ activeWorkspaceId: null })
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onNewAgentFromHeader).toHaveBeenCalledWith('w1')
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
