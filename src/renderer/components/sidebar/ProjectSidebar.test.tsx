import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import type { DraftId } from '../../../shared/draft-chat'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
} from './ProjectSidebar.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

describe('ProjectSidebar', () => {
  it('renders every workspace with the folders it spans', () => {
    renderSidebar()

    expect(screen.getByText('alpha-space')).toBeInTheDocument()
    expect(screen.getByText('beta-space')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('gives a one-folder workspace the same folder row as a multi-folder one', () => {
    renderSidebar({
      workspaces: [
        { id: 'w1', name: 'solo', projectIds: ['p1'], createdAt: '2024-01-01' },
        { id: 'w2', name: 'pair', projectIds: ['p1', 'p2'], createdAt: '2024-01-02' },
      ],
      sessionsByWorkspace: {},
    })

    const solo = screen.getByText('solo').closest<HTMLElement>('.sidebar-workspace-card')
    const pair = screen.getByText('pair').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(solo!).getAllByRole('button', { name: /Show files in/ })).toHaveLength(1)
    expect(within(pair!).getAllByRole('button', { name: /Show files in/ })).toHaveLength(2)
  })

  it('shows "No repositories yet" only when there are no workspaces at all', () => {
    renderSidebar({ workspaces: [], sessionsByWorkspace: {} })

    expect(screen.getByText('No repositories yet')).toBeInTheDocument()
  })

  // Agents are the tabs of the main view's Agent panel now; the card only shows
  // where work happens (folders, branch) and that someone is working (the dot).
  it('shows no agent rows — agents live in the main view', () => {
    renderSidebar()

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).queryByText('oslo')).not.toBeInTheDocument()
    expect(within(card!).queryByText('bergen')).not.toBeInTheDocument()
    expect(within(card!).queryByText('Claude')).not.toBeInTheDocument()
  })

  it('pulses a dot on the workspace name while one of its agents is outputting', () => {
    renderSidebar({ outputtingSessionIds: new Set(['s1']) })

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).getByLabelText('An agent is working in this workspace')).toBeInTheDocument()
  })

  it('shows no dot while its agents are quiet', () => {
    renderSidebar()

    expect(screen.queryByLabelText('An agent is working in this workspace')).not.toBeInTheDocument()
  })

  it('calls onNewProject when Add Repository is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Add Repository' }))

    expect(props.onNewProject).toHaveBeenCalled()
  })

  it('renders only Add Repository in the compact top toolbar', () => {
    renderSidebar()

    const toolbar = screen.getByRole('toolbar', { name: 'Repository actions' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Add Repository'])
  })

  it('puts Copy to new worktree and Add folder on the workspace header, and no New agent', () => {
    const { props } = renderSidebar()

    const header = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-project-row')
    fireEvent.click(within(header!).getByRole('button', { name: 'Copy alpha-space to a new worktree' }))
    fireEvent.click(within(header!).getByRole('button', { name: 'Add folder to alpha-space' }))

    expect(props.onCopyWorkspace).toHaveBeenCalledWith('w1')
    expect(props.onAddProjectToWorkspace).toHaveBeenCalledWith('w1')
    expect(within(header!).queryByRole('button', { name: /Add agent/ })).not.toBeInTheDocument()
  })

  it('selecting a folder row calls onSelectWorkspaceRepo', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('Alpha'))

    expect(props.onSelectWorkspaceRepo).toHaveBeenCalledWith('w1', 'p1')
  })

  // An in-place agent has no worktree row of its own: the folder it checked out
  // is where its edits land, so the folder row is where the sidebar says so.
  describe('an in-place agent marks the folder it works in', () => {
    const inPlace: AgentSession = {
      id: 's3', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo',
      worktreePath: '/repos/alpha', status: 'running', pid: 3, additionalDirs: [], noWorktree: true,
    }
    const folderRow = (): HTMLElement =>
      screen.getByText('Alpha').closest<HTMLElement>('.sidebar-repo-row')!

    it('names the branch that agent has checked out there', () => {
      renderSidebar({ sessionsByWorkspace: { w1: [inPlace], w2: [] } })

      expect(within(folderRow()).getByLabelText(/works in this folder directly, on oslo/)).toBeInTheDocument()
    })

    it('leaves the folder unmarked for an agent that has its own worktree', () => {
      renderSidebar()

      expect(within(folderRow()).queryByLabelText(/works in this folder directly/)).not.toBeInTheDocument()
    })

    it('drops the mark once that agent has exited', () => {
      renderSidebar({ sessionsByWorkspace: { w1: [{ ...inPlace, status: 'done' }], w2: [] } })

      expect(within(folderRow()).queryByLabelText(/works in this folder directly/)).not.toBeInTheDocument()
    })
  })

  it('offers to remove a folder only while the workspace has more than one', () => {
    renderSidebar({
      workspaces: [
        { id: 'w1', name: 'solo', projectIds: ['p1'], createdAt: '2024-01-01' },
        { id: 'w2', name: 'pair', projectIds: ['p1', 'p2'], createdAt: '2024-01-02' },
      ],
      sessionsByWorkspace: {},
    })

    const solo = screen.getByText('solo').closest<HTMLElement>('.sidebar-workspace-card')
    const pair = screen.getByText('pair').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(solo!).queryByRole('button', { name: /Remove Alpha from workspace/ })).not.toBeInTheDocument()
    expect(within(pair!).getByRole('button', { name: 'Remove Alpha from workspace' })).toBeInTheDocument()
  })

  it('removes a workspace from its header button', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Remove alpha-space'))

    expect(props.onRemoveWorkspace).toHaveBeenCalledWith('w1')
  })

  it('renames a workspace on double-click and Enter', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onRenameWorkspace).toHaveBeenCalledWith('w1', 'Renamed')
  })

  it('discards a workspace rename on Escape', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(props.onRenameWorkspace).not.toHaveBeenCalled()
    expect(screen.getByText('alpha-space')).toBeInTheDocument()
  })

  it('ignores a blank workspace rename', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onRenameWorkspace).not.toHaveBeenCalled()
  })

  it('selects a workspace when its header row is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('alpha-space'))

    expect(props.onSelectWorkspace).toHaveBeenCalledWith('w1')
  })

  it('renders a New Workspace list action that calls onNewWorkspace', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('New Workspace'))

    expect(props.onNewWorkspace).toHaveBeenCalled()
  })

  it('keeps a static Workspaces label that is not a collapse control', () => {
    renderSidebar()

    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workspaces' })).not.toBeInTheDocument()
  })

  it('keeps stripping the manifold/ prefix from the workspace branch label', () => {
    renderSidebar({
      workspaces: [
        { id: 'w1', name: 'alpha-space', projectIds: ['p1'], createdAt: '2024-01-01', branchName: 'manifold/alpha-space', worktreePaths: { p1: '/wt/alpha' } },
      ],
      sessionsByWorkspace: { w1: [] },
    })

    expect(screen.getByTitle('Every folder here is checked out on manifold/alpha-space')).toHaveTextContent(/^alpha-space$/)
  })

  it('renders a draft chat row in the workspace holding its repo', () => {
    renderSidebar({
      drafts: [{ id: 'draft-1' as DraftId, projectId: 'p1', runtimeId: 'claude' }],
    })

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).getByText('New chat')).toBeInTheDocument()
  })

  it('does not render favorite buttons on workspace cards', () => {
    renderSidebar()

    expect(screen.queryByLabelText(/to Favorites/)).not.toBeInTheDocument()
  })

  it('does not render a manual refresh action for folders', () => {
    renderSidebar()

    expect(screen.queryByRole('button', { name: /Fetch Alpha/ })).not.toBeInTheDocument()
  })
})
