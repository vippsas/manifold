import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../../shared/norwegian-cities', () => ({
  pickRandomNorwegianCityName: vi.fn(() => 'Oslo'),
}))

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
    if (channel === 'git:has-uncommitted-changes') return Promise.resolve(false)
    if (channel === 'git:list-branches') {
      return Promise.resolve([
        { name: 'main', source: 'both' },
        { name: 'feature-x', source: 'local' },
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
    projectId: 'proj-1',
    projectName: 'kong-gateway',
    projectPath: '/repos/proj-1',
    baseBranch: 'main',
    isGitProject: true,
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
const worktreeCard = (): HTMLElement => screen.getByRole('button', { name: /Run without a worktree/ })
const existingCard = (): HTMLElement => screen.getByRole('button', { name: /Continue on an existing branch or PR/ })

async function ready(): Promise<void> {
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
}

describe('NewAgentHero', () => {
  it('names the repository the cards act on', async () => {
    renderHero()
    await ready()

    expect(screen.getByText('kong-gateway')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  // The card click is the launch, so the mode has to travel with the click
  // rather than be read back from state on the next render.
  it('launches a chat agent straight from the Start Chat card', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.click(chatCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ nonInteractive: true, prompt: 'Oslo' }),
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

  it('uses the typed name as the prompt', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.change(screen.getByPlaceholderText(nameField), { target: { value: 'Dark mode toggle' } })
    fireEvent.click(terminalCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Dark mode toggle', autoName: false }),
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

  it('sends noWorktree once the worktree card is switched on', async () => {
    const { props } = renderHero()
    await ready()

    expect(worktreeCard()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(worktreeCard())
    expect(worktreeCard()).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(terminalCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(expect.objectContaining({ noWorktree: true }))
    })
  })

  it('starts on the branch picked after switching the branch card on', async () => {
    const { props } = renderHero()
    await ready()

    fireEvent.click(existingCard())
    fireEvent.click(await screen.findByText('feature-x'))
    fireEvent.click(terminalCard())

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ baseBranch: 'feature-x', noWorktree: true }),
      )
    })
  })

  // The branch/PR choice already decides where the agent runs, so the worktree
  // card can't contradict it.
  it('locks the worktree card while a branch or PR is being chosen', async () => {
    renderHero()
    await ready()

    fireEvent.click(existingCard())

    expect(worktreeCard()).toBeDisabled()
    expect(worktreeCard()).toHaveAttribute('aria-pressed', 'true')
  })

  it('blocks launching until a branch is chosen', async () => {
    renderHero()
    await ready()

    fireEvent.click(existingCard())

    expect(terminalCard()).toBeDisabled()
    expect(chatCard()).toBeDisabled()
  })

  it('drops the git-only cards for a plain folder', async () => {
    renderHero({ isGitProject: false })
    await ready()

    expect(screen.queryByRole('button', { name: /Run without a worktree/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue on an existing branch/ })).not.toBeInTheDocument()
    expect(screen.getByText(/not a Git repository/)).toBeInTheDocument()
  })

  it('offers existing worktrees to resume below the cards', async () => {
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

    expect(screen.getByText('Existing worktrees')).toBeInTheDocument()
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

  it('confirms before switching a dirty working copy', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      if (channel === 'git:has-uncommitted-changes') return Promise.resolve(true)
      return Promise.resolve([])
    })
    const { props } = renderHero()
    await ready()

    fireEvent.click(worktreeCard())
    fireEvent.click(terminalCard())

    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy())
    expect(props.onLaunch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Continue'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ noWorktree: true, allowDirtyWorktree: true }),
      )
    })
  })
})
