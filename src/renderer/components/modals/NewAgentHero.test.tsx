// The full-panel start view of a workspace with no agent yet. It lists the
// providers you can start and offers the workspace's finished agents to resume —
// nothing here picks a repo, a branch or a worktree, because the workspace
// already is the place.
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
        { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
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

const ready = (): Promise<unknown> =>
  waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

describe('NewAgentHero', () => {
  it('names the workspace the agent will join in the heading', async () => {
    renderHero()
    await ready()

    expect(screen.getByRole('heading', { name: 'New agent for Checkout redesign' })).toBeInTheDocument()
  })

  // Exactly one row leads, so the list has a default instead of a wall of
  // equals. `.btn-metal` is the gold plate; the rest stay console plates.
  it('gives the gold plate to the remembered runtime, and only to it', async () => {
    renderHero({ defaultRuntime: 'codex' })
    await ready()

    expect(await screen.findByRole('button', { name: /Codex/ })).toHaveClass('btn-metal')
    expect(screen.getByRole('button', { name: /Claude Code/ })).not.toHaveClass('btn-metal')
    expect(screen.getByRole('button', { name: /Chat with interface/ })).not.toHaveClass('btn-metal')
  })

  // A plate advertising a runtime you can't launch is a dead default.
  it('leads with an installed runtime when the remembered one is missing', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([
          { id: 'claude', name: 'Claude Code', binary: 'claude', installed: false },
          { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
        ])
      }
      return Promise.resolve([])
    })
    renderHero({ defaultRuntime: 'claude' })
    await ready()

    expect(await screen.findByRole('button', { name: /Codex/ })).toHaveClass('btn-metal')
    expect(screen.getByRole('button', { name: /Claude Code/ })).not.toHaveClass('btn-metal')
  })

  it('lists the providers as rows to start', async () => {
    renderHero()
    await ready()

    expect(await screen.findByRole('button', { name: /Claude Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chat with interface/ })).toBeInTheDocument()
  })

  it('starts a terminal agent from a provider row', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Codex/ }))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: 'codex', nonInteractive: false }),
      )
    })
  })

  it('starts a chat agent after choosing a provider under the Chat row', async () => {
    const { props } = renderHero()
    await ready()
    await screen.findByRole('button', { name: /Claude Code/ })

    fireEvent.click(screen.getByRole('button', { name: /Chat with interface/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /Claude Code/ })[1])

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: 'claude', nonInteractive: true }),
      )
    })
  })

  // Where the agent works is the workspace's business: no branch, no PR, no
  // worktree choice, and no git call to back one.
  it('offers no branch, PR or worktree choice', async () => {
    renderHero()
    await ready()

    expect(screen.queryByRole('button', { name: /worktree/i })).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:list-branches', expect.anything())
    expect(mockInvoke).not.toHaveBeenCalledWith('git:has-uncommitted-changes', expect.anything())
  })

  it('offers the workspace finished agents to resume below the list', async () => {
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

    expect(await screen.findByText('Agents you can resume')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    await waitFor(() => expect(onResumeSession).toHaveBeenCalledWith('session-dormant', 'claude'))
  })

  it('reports a failed launch and re-enables the row', async () => {
    renderHero({ onLaunch: vi.fn().mockResolvedValue(null) })
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => expect(screen.getByText('Failed to start agent.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Claude Code/ })).toBeEnabled()
  })
})
