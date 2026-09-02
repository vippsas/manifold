// The New Agent dialog is workspace-scoped: a list of providers you click to
// start a terminal agent. It asks nothing about names, repos, branches, PRs or
// worktrees — the workspace is the place, and every agent started here joins it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import { NewAgentForm } from './NewAgentForm'
import type { AgentSession } from '../../../shared/types'

const mockInvoke = vi.fn()

function withRuntimes(...installed: string[]): void {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'runtimes:list') {
      return Promise.resolve([
        { id: 'claude', name: 'Claude Code', binary: 'claude', installed: installed.includes('claude') },
        { id: 'codex', name: 'Codex', binary: 'codex', installed: installed.includes('codex') },
      ])
    }
    return Promise.resolve([])
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  withRuntimes('claude', 'codex')
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function renderForm(overrides = {}) {
  const props = {
    workspaceName: 'Checkout redesign',
    primaryPath: '/worktrees/checkout/storefront',
    defaultRuntime: 'claude',
    defaultAgentMode: 'interactive' as const,
    onLaunch: vi.fn().mockResolvedValue({ id: 'session-1' }),
    ...overrides,
  }
  return { ...render(<NewAgentForm {...props} />), props }
}

const ready = (): Promise<unknown> =>
  waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

const providerRow = (name: RegExp): HTMLElement => screen.getByRole('button', { name })

describe('NewAgentForm', () => {
  it('lists a row per installed provider', async () => {
    renderForm()
    await ready()

    expect(await screen.findByRole('button', { name: /Claude Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument()
  })

  it('starts a terminal agent when a provider row is clicked', async () => {
    const { props } = renderForm()
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Codex/ }))

    await waitFor(() => {
      // Named even though it is the first: an unnamed session falls back to its
      // branch label, which every agent in the workspace shares.
      expect(props.onLaunch).toHaveBeenCalledWith({
        runtimeId: 'codex',
        displayName: 'Codex',
        nonInteractive: false,
      })
    })
  })

  const session = (id: string, runtimeId: string, displayName?: string): AgentSession => ({
    id,
    projectId: 'p1',
    runtimeId,
    status: 'running',
    pid: 1,
    additionalDirs: [],
    displayName,
  } as unknown as AgentSession)

  it('numbers a second agent of the same provider', async () => {
    const { props } = renderForm({ existingSessions: [session('a', 'claude', 'Claude')] })
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: 'claude', displayName: 'Claude 2' }),
      )
    })
  })

  // The bug this replaced: the name came from *counting* same-runtime agents, so
  // deleting one from the middle handed its number to the next agent started.
  it('skips a name still in use after a middle agent was deleted', async () => {
    const existingSessions = [session('a', 'claude', 'Claude'), session('c', 'claude', 'Claude 3')]
    const { props } = renderForm({ existingSessions })
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: 'claude', displayName: 'Claude 2' }),
      )
    })
  })

  it('shows a missing provider disabled and does not launch it', async () => {
    withRuntimes('claude')
    const { props } = renderForm()
    await ready()

    const codex = await screen.findByRole('button', { name: /Codex/ })
    expect(codex).toBeDisabled()
    expect(screen.getByText('not installed')).toBeInTheDocument()

    fireEvent.click(codex)
    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('leaves out the Ollama variants that would double a row', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([
          { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
          { id: 'ollama-claude', name: 'Claude Code (Ollama)', binary: 'ollama', installed: true, needsModel: true },
        ])
      }
      return Promise.resolve([])
    })
    renderForm()
    await ready()

    await screen.findByRole('button', { name: /^Claude Code/ })
    expect(screen.queryByRole('button', { name: /Ollama/ })).not.toBeInTheDocument()
  })

  it('remembers a non-default provider when it launches', async () => {
    renderForm()
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Codex/ }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultRuntime: 'codex' })
    })
  })

  it('writes nothing when the default provider starts in terminal', async () => {
    const { props } = renderForm()
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
  })

  it('offers no branch, PR or worktree choice', async () => {
    renderForm()
    await ready()

    expect(screen.queryByText(/Advanced/)).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:list-branches', expect.anything())
    expect(mockInvoke).not.toHaveBeenCalledWith('git:has-uncommitted-changes', expect.anything())
  })

  it('shows an error and re-enables the row when launch returns null', async () => {
    const { props } = renderForm({ onLaunch: vi.fn().mockResolvedValue(null) })
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(await screen.findByText('Failed to start agent.')).toBeInTheDocument()
    expect(providerRow(/Claude Code/)).toBeEnabled()
  })

  it('starts an agent under StrictMode (mountedRef valid after remount)', async () => {
    const onLaunch = vi.fn().mockResolvedValue({ id: 'session-1' })
    render(
      <React.StrictMode>
        <NewAgentForm
          workspaceName="Checkout redesign"
          primaryPath="/worktrees/checkout/storefront"
          defaultRuntime="claude"
          defaultAgentMode="interactive"
          onLaunch={onLaunch}
        />
      </React.StrictMode>,
    )
    await ready()

    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/ }))

    await waitFor(() => expect(onLaunch).toHaveBeenCalled())
    expect(screen.queryByText(/Failed to start agent/)).toBeNull()
  })
})
