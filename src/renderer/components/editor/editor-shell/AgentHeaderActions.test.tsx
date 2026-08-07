// The + in the agent group's tab bar is where a new agent is added: it opens the
// New Agent dialog on the active workspace, the same dialog the empty agent view
// and the command palette use.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { AgentCloseHeaderActions, AgentHeaderActions } from './AgentHeaderActions'

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
    onCloseSiblingPanel: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
}

function makeProps(panelIds: string[], activePanelId?: string): IDockviewHeaderActionsProps {
  return {
    panels: panelIds.map((id) => ({ id })),
    activePanel: activePanelId ? { id: activePanelId } : undefined,
  } as unknown as IDockviewHeaderActionsProps
}

function renderActions(state: DockAppState, panelIds: string[], activePanelId?: string): void {
  render(
    <DockStateContext.Provider value={state}>
      <AgentHeaderActions {...makeProps(panelIds, activePanelId)} />
    </DockStateContext.Provider>,
  )
}

function renderCloseActions(state: DockAppState, panelIds: string[], activePanelId?: string): void {
  render(
    <DockStateContext.Provider value={state}>
      <AgentCloseHeaderActions {...makeProps(panelIds, activePanelId)} />
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

  it('hides the active sibling agent tab from the far-right ×', () => {
    const state = makeState()
    renderCloseActions(state, ['agent', 'agent:s7'], 'agent:s7')

    const hide = screen.getByLabelText('Hide agent tab')
    expect(hide).not.toBeDisabled()
    fireEvent.click(hide)

    expect(state.onCloseSiblingPanel).toHaveBeenCalledWith('s7')
  })

  it('disables the far-right × while the primary agent tab is active', () => {
    const state = makeState()
    renderCloseActions(state, ['agent', 'agent:s7'], 'agent')

    expect(screen.getByLabelText('Hide agent tab')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Hide agent tab'))
    expect(state.onCloseSiblingPanel).not.toHaveBeenCalled()
  })

  it('keeps the + on the left slot free of the hide ×', () => {
    renderActions(makeState(), ['agent'], 'agent')

    expect(screen.getByLabelText('New agent in checkout')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hide agent tab')).not.toBeInTheDocument()
  })

  it('no longer carries the settings gear (settings moved onto each tab)', () => {
    renderActions(makeState(), ['agent'], 'agent')

    expect(screen.queryByLabelText('Agent settings')).not.toBeInTheDocument()
  })
})
