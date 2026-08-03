// The full-panel start view of a workspace with no agent yet. It starts an agent
// in that workspace and offers its finished ones to resume — nothing here picks a
// repo, a branch or a worktree, because the workspace already is the place.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import { NewAgentHero } from './NewAgentHero'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'runtimes:list') {
      return Promise.resolve([
        { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
      ])
    }
    return Promise.resolve([])
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function renderHero(overrides = {}) {
  const props = {
    workspaceName: 'Checkout redesign',
    primaryPath: '/worktrees/checkout/storefront',
    branchLabel: 'checkout-redesign',
    defaultRuntime: 'claude',
    defaultAgentMode: 'interactive' as const,
    onLaunch: vi.fn().mockResolvedValue({ id: 'session-1' }),
    ...overrides,
  }
  return { ...render(<NewAgentHero {...props} />), props }
}

const nameField = 'Agent name (optional), e.g. Dark mode toggle'
const chatCard = (): HTMLElement => screen.getByRole('button', { name: /Start Chat/ })
const terminalCard = (): HTMLElement => screen.getByRole('button', { name: /Start Terminal/ })

async function ready(): Promise<void> {
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
}

describe('NewAgentHero', () => {
  it('names the branch the workspace works on', async () => {
    renderHero()
    await ready()

    expect(screen.getByText('checkout-redesign')).toBeInTheDocument()
  })

  // The card click is the launch, so the mode has to travel with the click
  // rather than be read back from state on the next render.
  it('launches a chat agent straight from the Start Chat card', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.click(chatCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ nonInteractive: true, displayName: '' }),
      )
    })
  })

  it('launches a terminal agent straight from the Start Terminal card', async () => {
    const { props } = renderHero({ defaultAgentMode: 'chat' as const })
    await ready()

    fireEvent.click(terminalCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ nonInteractive: false }),
      )
    })
  })

  it('remembers the mode picked by the card for the next agent', async () => {
    renderHero()
    await ready()

    fireEvent.click(chatCard())

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultAgentMode: 'chat' })
    })
  })

  it('writes no setting when the card matches the remembered mode', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.click(terminalCard())

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
  })

  it('names the agent from the typed name', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.change(screen.getByPlaceholderText(nameField), { target: { value: 'Dark mode toggle' } })
    fireEvent.click(terminalCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Dark mode toggle' }),
      )
    })
  })

  // Enter in the name field has no card to carry a mode, so it launches the
  // remembered one — which is why that card is the one marked with ↵.
  it('launches the remembered mode when the name field is submitted', async () => {
    const { props } = renderHero({ defaultAgentMode: 'chat' as const })
    await ready()

    fireEvent.submit(screen.getByPlaceholderText(nameField).closest('form')!)

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ nonInteractive: true }),
      )
    })
  })

  // Where the agent works is the workspace's business: no branch, no PR, no
  // worktree choice, and no git call to back one.
  it('offers no branch, PR or worktree choice', async () => {
    renderHero()
    await ready()

    expect(screen.queryByRole('button', { name: /worktree/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue on an existing branch/ })).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:list-branches', expect.anything())
    expect(mockInvoke).not.toHaveBeenCalledWith('git:has-uncommitted-changes', expect.anything())
  })

  it('offers the workspace finished agents to resume below the cards', async () => {
    const onResumeSession = vi.fn().mockResolvedValue(undefined)
    renderHero({
      onResumeSession,
      existingSessions: [{
        id: 'session-dormant',
        projectId: 'proj-1',
        runtimeId: 'claude',
        branchName: 'manifold/existing-branch',
        worktreePath: '/repos/proj-1/.manifold/worktrees/existing',
        status: 'done' as const,
        pid: null,
        taskDescription: 'Existing task',
        additionalDirs: [],
      }],
    })
    await ready()

    expect(screen.getByText('Agents you can resume')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    await waitFor(() => expect(onResumeSession).toHaveBeenCalledWith('session-dormant', 'claude'))
  })

  it('reports a failed launch and re-enables the cards', async () => {
    renderHero({ onLaunch: vi.fn().mockResolvedValue(null) })
    await ready()

    fireEvent.click(terminalCard())

    await waitFor(() => expect(screen.getByText('Failed to start agent.')).toBeInTheDocument())
    expect(terminalCard()).toBeEnabled()
  })
})
