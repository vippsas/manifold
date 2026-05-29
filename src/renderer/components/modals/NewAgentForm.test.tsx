import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../../shared/norwegian-cities', () => ({
  pickRandomNorwegianCityName: vi.fn(() => 'Oslo'),
}))

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
    projectId: 'proj-1',
    projectPath: '/repos/proj-1',
    baseBranch: 'main',
    isGitProject: true,
    defaultRuntime: 'claude',
    defaultAgentMode: 'interactive' as const,
    onLaunch: vi.fn().mockResolvedValue({ id: 'session-1' }),
    ...overrides,
  }

  return { ...render(<NewAgentForm {...props} />), props }
}

describe('NewAgentForm', () => {
  it('allows submitting without typing an agent name', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Start Agent')).toBeEnabled()
  })

  it('uses a random Norwegian city when submitted with a blank name', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          runtimeId: 'claude',
          prompt: 'Oslo',
        }),
      )
    })
  })

  it('uses the typed agent name when one is provided', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.change(screen.getByPlaceholderText('Agent name (optional), e.g. Dark mode toggle'), {
      target: { value: 'Dark mode toggle' },
    })
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Dark mode toggle',
        }),
      )
    })
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

  it('renders existing worktrees with resume and delete actions', async () => {
    const onResumeSession = vi.fn().mockResolvedValue(undefined)
    const onDeleteSession = vi.fn()
    const existingSession = {
      id: 'session-dormant',
      projectId: 'proj-1',
      runtimeId: 'claude',
      branchName: 'manifold/existing-branch',
      worktreePath: '/repos/proj-1/.manifold/worktrees/existing',
      status: 'done' as const,
      pid: null,
      taskDescription: 'Existing task',
      additionalDirs: [],
    }

    renderForm({
      existingSessions: [existingSession],
      onResumeSession,
      onDeleteSession,
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Existing worktrees')).toBeInTheDocument()
    expect(screen.getByText('proj-1')).toBeInTheDocument()
    expect(screen.getByText('Worktree: existing')).toBeInTheDocument()
    expect(screen.getByText('Agent: Claude')).toBeInTheDocument()
    expect(screen.getByText('Existing task')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => {
      expect(onResumeSession).toHaveBeenCalledWith('session-dormant', 'claude')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteSession).toHaveBeenCalledWith(existingSession)
  })

  it('renders the Interactive | Chat toggle, defaulting to Interactive', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
    expect(screen.getByText('Interactive')).toBeInTheDocument()
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
    fireEvent.click(screen.getByText('Interactive'))
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

  async function openBranchPicker() {
    fireEvent.click(screen.getByText(/Advanced/))
    fireEvent.click(screen.getByLabelText('Continue on an existing branch or PR'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('git:list-branches', 'proj-1'))
  }

  it('does not create a worktree by default (empty picker)', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    const options = props.onLaunch.mock.calls[0][0]
    expect(options.noWorktree).toBeUndefined()
    expect(options.existingBranch).toBeUndefined()
  })

  it('selecting a branch works in place on it (existingBranch + noWorktree)', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      }
      if (channel === 'git:list-branches') {
        return Promise.resolve([
          { name: 'main', source: 'both' },
          { name: 'feature-x', source: 'local' },
        ])
      }
      return Promise.resolve([])
    })
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    await openBranchPicker()
    fireEvent.click(await screen.findByText('feature-x'))
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ existingBranch: 'feature-x', noWorktree: true }),
      )
    })
  })

  it('allows selecting the base branch to work in place on it', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      }
      if (channel === 'git:list-branches') {
        return Promise.resolve([{ name: 'main', source: 'both' }])
      }
      return Promise.resolve([])
    })
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    await openBranchPicker()
    fireEvent.click(await screen.findByText('main'))
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ existingBranch: 'main', noWorktree: true }),
      )
    })
  })

  it('truncates long task context in existing worktrees rows', async () => {
    renderForm({
      existingSessions: [{
        id: 'session-long',
        projectId: 'proj-1',
        runtimeId: 'claude',
        branchName: 'manifold/very-long',
        worktreePath: '/repos/proj-1/.manifold/worktrees/very-long',
        status: 'done' as const,
        pid: null,
        taskDescription: 'Inspect this repository and summarize what it is for while keeping the report concise and focused on practical structure details',
        additionalDirs: [],
      }],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Agent: Claude')).toBeInTheDocument()
    expect(screen.getByText('Inspect this repository and summarize what it is for while keeping the...')).toBeInTheDocument()
  })
})
