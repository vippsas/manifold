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
    if (channel === 'git:has-uncommitted-changes') {
      return Promise.resolve(false)
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

  it('creates a no-worktree agent under StrictMode (mountedRef valid after remount)', async () => {
    const onLaunch = vi.fn().mockResolvedValue({ id: 'session-1' })
    render(
      <React.StrictMode>
        <NewAgentForm
          projectId="proj-1"
          projectPath="/repos/proj-1"
          baseBranch="main"
          isGitProject={true}
          defaultRuntime="claude"
          defaultAgentMode="interactive"
          defaultUseWorktrees={false}
          onLaunch={onLaunch}
        />
      </React.StrictMode>,
    )
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ noWorktree: true }))
    })
  })

  it('defaults to a worktree agent when an in-place agent already exists (2nd agent)', async () => {
    // Global setting is off (defaultUseWorktrees:false) but an in-place agent is live,
    // so a new agent must use a worktree — clicking Start creates a real 2nd agent.
    const { props } = renderForm({
      defaultUseWorktrees: false,
      existingSessions: [
        { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'running', pid: 1, additionalDirs: [], noWorktree: true },
      ],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    const options = props.onLaunch.mock.calls[0][0]
    expect(options.noWorktree).toBeUndefined()
    expect(screen.queryByText(/only one in-place agent runs per repo/i)).toBeNull()
  })

  it('creates an agent in place when defaultUseWorktrees is false (empty picker)', async () => {
    const { props } = renderForm({ defaultUseWorktrees: false })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    const options = props.onLaunch.mock.calls[0][0]
    expect(options.noWorktree).toBe(true)
    expect(options.existingBranch).toBeUndefined()
    expect(options.stayOnBranch).toBeUndefined()
    // Clean tree → no confirmation, no allowDirtyWorktree flag.
    expect(options.allowDirtyWorktree).toBeUndefined()
    // Blank name → autoName so the agent is named after its branch.
    expect(options.autoName).toBe(true)
    expect(screen.queryByText(/uncommitted changes/i)).toBeNull()
  })

  it('does not set autoName when a name is typed', async () => {
    const { props } = renderForm({ defaultUseWorktrees: false })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.change(screen.getByPlaceholderText('Agent name (optional), e.g. Dark mode toggle'), {
      target: { value: 'Fix the parser' },
    })
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
    expect(props.onLaunch.mock.calls[0][0].autoName).toBe(false)
  })

  function dirtyRepoInvoke(channel: string) {
    if (channel === 'runtimes:list') {
      return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
    }
    if (channel === 'git:has-uncommitted-changes') return Promise.resolve(true)
    return Promise.resolve([])
  }

  it('confirms before starting a no-worktree new-branch agent in a dirty repo', async () => {
    mockInvoke.mockImplementation(dirtyRepoInvoke)
    const { props } = renderForm({ defaultUseWorktrees: false })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    // A typed name cuts a new branch off the base, which is the case that needs
    // the clean-tree confirmation (working directly on the base tolerates dirt).
    fireEvent.change(screen.getByPlaceholderText('Agent name (optional), e.g. Dark mode toggle'), {
      target: { value: 'New parser' },
    })
    fireEvent.click(screen.getByText('Start Agent'))

    // Dialog appears; nothing launched yet.
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy())
    expect(props.onLaunch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Continue'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ noWorktree: true, allowDirtyWorktree: true }),
      )
    })
  })

  it('cancels the dirty-repo confirmation without launching', async () => {
    mockInvoke.mockImplementation(dirtyRepoInvoke)
    const { props } = renderForm({ defaultUseWorktrees: false })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.change(screen.getByPlaceholderText('Agent name (optional), e.g. Dark mode toggle'), {
      target: { value: 'New parser' },
    })
    fireEvent.click(screen.getByText('Start Agent'))
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy())

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => expect(screen.queryByText('Continue')).toBeNull())
    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('confirms a dirty tree even for a no-name (work-on-base) no-worktree agent', async () => {
    mockInvoke.mockImplementation(dirtyRepoInvoke)
    const { props } = renderForm({ defaultUseWorktrees: false })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    // Blank name → autoName (work directly on base); switching the working copy
    // with a dirty tree must still prompt, not silently carry changes.
    fireEvent.click(screen.getByText('Start Agent'))
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy())
    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('blocks selecting a branch/PR when an in-place agent is already running', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      if (channel === 'git:has-uncommitted-changes') return Promise.resolve(false)
      if (channel === 'git:list-branches') return Promise.resolve([{ name: 'feature-x', source: 'local' }])
      return Promise.resolve([])
    })
    const { props } = renderForm({
      existingSessions: [
        { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'feature/A', worktreePath: '/repos/proj-1', status: 'running', pid: 1, additionalDirs: [], noWorktree: true },
      ],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText(/Advanced/))
    fireEvent.click(screen.getByLabelText('Continue on an existing branch or PR'))
    fireEvent.click(await screen.findByText('feature-x'))
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => expect(screen.getByText(/only one can run at a time/i)).toBeTruthy())
    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('warns only when the user opts into in-place while an in-place agent is running', async () => {
    renderForm({
      defaultUseWorktrees: false,
      existingSessions: [
        { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'running', pid: 1, additionalDirs: [], noWorktree: true },
      ],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    // Default is a worktree agent (in-place is taken) → no warning yet.
    expect(screen.queryByText(/only one in-place agent runs per repo/i)).toBeNull()

    // Opting into in-place surfaces the warning (Start would switch to the existing).
    fireEvent.click(screen.getByText(/Advanced/))
    fireEvent.click(screen.getByLabelText('Run without a worktree'))
    expect(screen.getByText(/only one in-place agent runs per repo/i)).toBeTruthy()
  })

  it('does not warn when the existing in-place agent is finished', async () => {
    renderForm({
      defaultUseWorktrees: false,
      existingSessions: [
        { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'done', pid: null, additionalDirs: [], noWorktree: true },
      ],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.queryByText(/only one in-place agent runs per repo/i)).toBeNull()
  })

  it('does not warn when this agent will use a worktree', async () => {
    renderForm({
      defaultUseWorktrees: true,
      existingSessions: [
        { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'running', pid: 1, additionalDirs: [], noWorktree: true },
      ],
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.queryByText(/only one in-place agent runs per repo/i)).toBeNull()
  })

  it('sends noWorktree when "Run without a worktree" is checked', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText(/Advanced/))
    fireEvent.click(screen.getByLabelText('Run without a worktree'))
    fireEvent.click(screen.getByText('Start Agent'))

    await waitFor(() => {
      expect(props.onLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ noWorktree: true }),
      )
    })
  })

  it('selecting a branch sets it as the base branch (baseBranch + noWorktree)', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      }
      if (channel === 'git:has-uncommitted-changes') {
        return Promise.resolve(false)
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
        expect.objectContaining({ baseBranch: 'feature-x', noWorktree: true }),
      )
    })
  })

  it('allows selecting the base branch to work in place on it', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') {
        return Promise.resolve([{ id: 'claude', name: 'Claude Code', binary: 'claude', installed: true }])
      }
      if (channel === 'git:has-uncommitted-changes') {
        return Promise.resolve(false)
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
        expect.objectContaining({ baseBranch: 'main', noWorktree: true }),
      )
    })
  })

  it('in compact mode shows the AI picker and hides Advanced + resume', async () => {
    renderForm({ compact: true })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
    // AI/runtime picker is shown directly (not behind Advanced)
    expect(screen.getByLabelText('Agent')).toBeInTheDocument()
    // No Advanced toggle, no resume controls
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
    expect(screen.queryByText('Continue on an existing branch or PR')).not.toBeInTheDocument()
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
        if (channel === 'git:has-uncommitted-changes') return Promise.resolve(false)
        return Promise.resolve([])
      })
    }

    it('gives every installed runtime its own tile', async () => {
      withRuntimes('claude', 'codex')
      renderForm({ compact: true })

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
      renderForm({ compact: true })

      await screen.findByRole('radio', { name: /Claude Code/ })
      expect(screen.getAllByRole('radio')).toHaveLength(1)
    })

    it('leaves out a runtime whose binary is missing', async () => {
      withRuntimes('claude')
      renderForm({ compact: true })

      await screen.findByRole('radio', { name: /Claude Code/ })
      expect(screen.queryByRole('radio', { name: /Codex/ })).not.toBeInTheDocument()
    })

    // Dropping it would leave Start disabled with nothing on screen to explain why.
    it('keeps the selected runtime visible when its binary is missing', async () => {
      withRuntimes('claude')
      renderForm({ compact: true, defaultRuntime: 'codex' })

      expect(await screen.findByRole('radio', { name: /Codex/ })).toBeInTheDocument()
      expect(screen.getByText('not installed')).toBeInTheDocument()
      expect(screen.getByText('Start Agent')).toBeDisabled()
    })

    it('starts the agent on the picked runtime', async () => {
      withRuntimes('claude', 'codex')
      const { props } = renderForm({ compact: true })

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => {
        expect(props.onLaunch).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'codex' }))
      })
    })

    it('remembers the picked runtime for the next agent', async () => {
      withRuntimes('claude', 'codex')
      renderForm({ compact: true })

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultRuntime: 'codex' })
      })
    })

    it('saves a changed runtime and mode in one settings write', async () => {
      withRuntimes('claude', 'codex')
      renderForm({ compact: true })

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByText('Chat'))
      fireEvent.click(screen.getByText('Start Chat'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('settings:update', { defaultAgentMode: 'chat', defaultRuntime: 'codex' })
      })
    })

    it('writes nothing when the picked runtime is already the default', async () => {
      withRuntimes('claude', 'codex')
      renderForm({ compact: true })

      fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Claude Code/ }))
      fireEvent.click(screen.getByText('Start Agent'))

      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
      expect(mockInvoke).not.toHaveBeenCalledWith('settings:update', expect.anything())
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
