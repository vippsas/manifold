// The split + in the agent group's tab bar is where a new agent is added: the +
// starts the default agent at once, the caret lists the runtimes, and "More…"
// opens the New Agent dialog the empty agent view and the command palette use.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { AgentCloseHeaderActions, AgentHeaderActions } from './AgentHeaderActions'

const mockInvoke = vi.fn()

const RUNTIMES = [
  { id: 'claude', name: 'Claude Code', installed: true },
  { id: 'codex', name: 'Codex', installed: true },
  { id: 'gemini', name: 'Gemini CLI', installed: false },
  { id: 'viola', name: 'Viola', kind: 'orchestrator', installed: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => Promise.resolve(channel === 'runtimes:list' ? RUNTIMES : []))
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
    onQuickAddAgent: vi.fn().mockResolvedValue(undefined),
    defaultRuntime: 'claude',
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

  it('starts the default agent at once from the +, with no dialog', () => {
    const state = makeState()
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onQuickAddAgent).toHaveBeenCalledWith('w1')
    expect(state.onNewAgentFromHeader).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument()
  })

  it('offers the + from a sibling agent tab too', () => {
    const state = makeState()
    renderActions(state, ['agent:s7'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onQuickAddAgent).toHaveBeenCalledWith('w1')
  })

  it('falls back to the workspace holding the active repo when none is focused', () => {
    const state = makeState({ activeWorkspaceId: null })
    renderActions(state, ['agent'])

    fireEvent.click(screen.getByLabelText('New agent in checkout'))

    expect(state.onQuickAddAgent).toHaveBeenCalledWith('w1')
  })

  describe('runtime dropdown', () => {
    async function openMenu(state: DockAppState): Promise<HTMLElement> {
      renderActions(state, ['agent'])
      fireEvent.click(screen.getByLabelText('Choose an agent'))
      const menu = await screen.findByRole('group', { name: 'Start an agent' })
      await within(menu).findByText('Codex')
      return menu
    }

    it('opens a small popover portaled to the body, listing runtimes with install status', async () => {
      const menu = await openMenu(makeState())

      expect(menu.parentElement).toBe(document.body)
      expect(screen.getByLabelText('Choose an agent')).toHaveAttribute('aria-expanded', 'true')
      expect(within(menu).getByText('Claude Code')).toBeInTheDocument()
      expect(within(menu).getByText('not installed')).toBeInTheDocument()
      expect(within(menu).getByRole('button', { name: /Gemini CLI/ })).toBeDisabled()
    })

    it('highlights the default runtime, or the workspace override when it has one', async () => {
      const menu = await openMenu(makeState())
      expect(within(menu).getByRole('button', { name: /Claude Code/ })).toHaveClass('btn-metal')
      expect(within(menu).getByRole('button', { name: /^Codex/ })).not.toHaveClass('btn-metal')
    })

    it('leads with the workspace runtime override', async () => {
      const menu = await openMenu(makeState({
        workspaces: [{ id: 'w1', name: 'checkout', projectIds: ['p1'], createdAt: '2024-01-01', runtimeId: 'codex' }],
      } as Partial<DockAppState>))
      expect(within(menu).getByRole('button', { name: /^Codex/ })).toHaveClass('btn-metal')
    })

    it('starts the picked runtime directly and closes', async () => {
      const state = makeState()
      const menu = await openMenu(state)

      fireEvent.click(within(menu).getByRole('button', { name: /^Codex/ }))

      expect(state.onQuickAddAgent).toHaveBeenCalledWith('w1', { runtimeId: 'codex', mode: 'interactive' })
      expect(state.onNewAgentFromHeader).not.toHaveBeenCalled()
      expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument()
    })

    it('starts an orchestrator in chat mode', async () => {
      const state = makeState()
      const menu = await openMenu(state)

      fireEvent.click(within(menu).getByRole('button', { name: /Viola/ }))

      expect(state.onQuickAddAgent).toHaveBeenCalledWith('w1', { runtimeId: 'viola', mode: 'chat' })
    })

    it('hands over to the full New Agent dialog from More…', async () => {
      const state = makeState()
      const menu = await openMenu(state)

      fireEvent.click(within(menu).getByRole('button', { name: 'More…' }))

      expect(state.onNewAgentFromHeader).toHaveBeenCalledWith('w1')
      expect(state.onQuickAddAgent).not.toHaveBeenCalled()
      expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument()
    })

    it('closes on Escape, on an outside click, and when the caret is pressed again', async () => {
      await openMenu(makeState())
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument())

      fireEvent.click(screen.getByLabelText('Choose an agent'))
      await screen.findByRole('group', { name: 'Start an agent' })
      fireEvent.mouseDown(document.body)
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument())

      fireEvent.click(screen.getByLabelText('Choose an agent'))
      await screen.findByRole('group', { name: 'Start an agent' })
      fireEvent.click(screen.getByLabelText('Choose an agent'))
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument())
    })

    it('puts keyboard focus on the first runtime so the list is operable without a mouse', async () => {
      const menu = await openMenu(makeState())
      expect(within(menu).getByRole('button', { name: /Claude Code/ })).toHaveFocus()
    })

    it('focuses the first runtime that can be launched when the first listed one is not installed', async () => {
      mockInvoke.mockImplementation((channel: string) => Promise.resolve(channel === 'runtimes:list'
        ? [{ id: 'gemini', name: 'Gemini CLI', installed: false }, { id: 'codex', name: 'Codex', installed: true }]
        : []))
      const menu = await openMenu(makeState({ defaultRuntime: 'codex' }))

      expect(within(menu).getByRole('button', { name: /^Codex/ })).toHaveFocus()
    })

    it('puts focus on More… when no runtime is installed, so Tab stays inside the menu', async () => {
      mockInvoke.mockImplementation((channel: string) => Promise.resolve(channel === 'runtimes:list'
        ? [{ id: 'gemini', name: 'Gemini CLI', installed: false }]
        : []))
      renderActions(makeState(), ['agent'])
      fireEvent.click(screen.getByLabelText('Choose an agent'))
      const menu = await screen.findByRole('group', { name: 'Start an agent' })

      await waitFor(() => expect(within(menu).getByRole('button', { name: 'More…' })).toHaveFocus())
    })

    it('still opens and closes after the dev StrictMode double-mount', async () => {
      const state = makeState()
      render(
        <React.StrictMode>
          <DockStateContext.Provider value={state}>
            <AgentHeaderActions {...makeProps(['agent'])} />
          </DockStateContext.Provider>
        </React.StrictMode>,
      )
      fireEvent.click(screen.getByLabelText('Choose an agent'))
      const menu = await screen.findByRole('group', { name: 'Start an agent' })
      await within(menu).findByText('Codex')

      fireEvent.keyDown(document, { key: 'Escape' })

      await waitFor(() => expect(screen.queryByRole('group', { name: 'Start an agent' })).not.toBeInTheDocument())
    })
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
