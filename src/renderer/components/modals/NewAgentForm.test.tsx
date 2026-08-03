// The New Agent dialog is workspace-scoped: a name, a runtime, Terminal or Chat.
// It asks nothing about repos, branches, PRs or worktrees — the workspace is the
// place, and every agent started here joins it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import { NewAgentForm } from './NewAgentForm'

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

const nameField = 'Agent name (optional), e.g. Dark mode toggle'

describe('NewAgentForm', () => {
  it('allows submitting without typing an agent name', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Start Agent')).toBeEnabled()
  })

  // A blank name used to become a random Norwegian city, because the name seeded
  // a branch. The workspace owns the branch now, so blank means blank and the
  // agent is left named after its runtime.
  it('sends an empty name when none is typed', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith({
        runtimeId: 'claude',
        displayName: '',
        nonInteractive: false,
      })
    })
  })

  it('names the agent when a name is typed', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.change(screen.getByPlaceholderText(nameField), {
      target: { value: 'Dark mode toggle' },
    })
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Dark mode toggle' }),
      )
    })
  })

  it('offers no branch, PR or worktree choice', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.queryByText(/Advanced/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Continue on an existing branch or PR')).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:list-branches', expect.anything())
    expect(mockInvoke).not.toHaveBeenCalledWith('git:has-uncommitted-changes', expect.anything())
  })

  it('shows an error and recovers when launch returns null', async () => {
    renderForm({ onLaunch: vi.fn().mockResolvedValue(null) })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(screen.getByText('Failed to start agent.')).toBeInTheDocument()
      expect(screen.getByText('Start Agent')).toBeEnabled()
    })
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
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(onLaunch).toHaveBeenCalled())
    expect(screen.queryByText(/Failed to start agent/)).toBeNull()
  })

  it('renders the Terminal | Chat toggle, defaulting to Terminal', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
  })

  it('submits nonInteractive: false by default', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ nonInteractive: false }),
    )
  })

  it('submits nonInteractive: true when Chat is selected', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Chat'))
    fireEvent.click(screen.getByText('Start Chat'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ nonInteractive: true }),
    )
  })

  it('updates the submit button label to "Start Chat" when Chat is selected', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Start Agent')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Chat'))
    expect(screen.getByText('Start Chat')).toBeInTheDocument()
    expect(screen.queryByText('Start Agent')).not.toBeInTheDocument()
  })

  it('honours defaultAgentMode="chat" as the initial mode', async () => {
    renderForm({ defaultAgentMode: 'chat' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Start Chat')).toBeInTheDocument()
    expect(screen.queryByText('Start Agent')).not.toBeInTheDocument()
  })

  it('does not persist mode on pill click — only on submit', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Chat'))
    fireEvent.click(screen.getByText('Terminal'))
    fireEvent.click(screen.getByText('Chat'))

    expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
  })

  it('persists defaultAgentMode on submit when the user changed mode', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Chat'))
    fireEvent.click(screen.getByText('Start Chat'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultAgentMode: 'chat' })
    })
  })

  it('does not persist defaultAgentMode on submit when mode equals default', async () => {
    renderForm({ defaultAgentMode: 'chat' as const })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Chat'))

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
    expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
  })

  // The runtime is picked from tiles rather than a dropdown, and the pick is
  // remembered the way the Terminal/Chat mode already is.
  describe('runtime tiles', () => {
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

    it('gives every installed runtime its own tile', async () => {
      withRuntimes('claude', 'codex')
      renderForm()

      expect(await screen.findByRole('radio', { name: /Claude Code/ })).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByRole('radio', { name: /Codex/ })).toHaveAttribute('aria-checked', 'false')
    })

    // Having Ollama installed marks both of its variants installed, which would
    // double every tile — two "Claude Code", two "Codex".
    it('leaves out the Ollama variants of runtimes it already shows', async () => {
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

      await screen.findByRole('radio', { name: /Claude Code/ })
      expect(screen.getAllByRole('radio')).toHaveLength(1)
    })

    it('leaves out a runtime whose binary is missing', async () => {
      withRuntimes('claude')
      renderForm()

      await screen.findByRole('radio', { name: /Claude Code/ })
      expect(screen.queryByRole('radio', { name: /Codex/ })).not.toBeInTheDocument()
    })

    // Dropping it would leave Start disabled with nothing on screen to explain why.
    it('keeps the selected runtime visible when its binary is missing', async () => {
      withRuntimes('claude')
      renderForm({ defaultRuntime: 'codex' })

      expect(await screen.findByRole('radio', { name: /Codex/ })).toBeInTheDocument()
      expect(screen.getByText('not installed')).toBeInTheDocument()
      expect(screen.getByText('Start Agent')).toBeDisabled()
    })

    it('starts the agent on the picked runtime', async () => {
      withRuntimes('claude', 'codex')
      const { props } = renderForm()

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => {
        expect(props.onLaunch).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'codex' }))
      })
    })

    it('remembers the picked runtime for the next agent', async () => {
      withRuntimes('claude', 'codex')
      renderForm()

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultRuntime: 'codex' })
      })
    })

    it('saves a changed runtime and mode in one settings write', async () => {
      withRuntimes('claude', 'codex')
      renderForm()

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Chat'))
      fireEvent.click(screen.getByText('Start Chat'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultAgentMode: 'chat', defaultRuntime: 'codex' })
      })
    })

    it('writes nothing when the picked runtime is already the default', async () => {
      withRuntimes('claude', 'codex')
      renderForm()

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Claude Code/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
      expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
    })
  })
})
