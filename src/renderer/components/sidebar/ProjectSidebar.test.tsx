import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import type { DraftId } from '../../../shared/draft-chat'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
  sampleSessions,
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

  it('hangs worktrees off the workspace rather than nesting them under a folder', () => {
    renderSidebar()

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).getByText('oslo')).toBeInTheDocument()
    expect(within(card!).getByText('bergen')).toBeInTheDocument()
    // The worktree rows are siblings of the folder row, not children of it.
    const folderRow = within(card!).getByText('Alpha').closest<HTMLElement>('.sidebar-repo-row')
    expect(within(folderRow!).queryByText('oslo')).not.toBeInTheDocument()
  })

  it('renders agent runtime labels', () => {
    renderSidebar()

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  it('calls onSelectSession with sessionId and projectId when a worktree is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('bergen'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s2', 'p1')
  })

  it('highlights the active worktree', () => {
    renderSidebar({ activeSessionId: 's1' })

    expect(screen.getByTitle('Claude - alpha/oslo')).toHaveClass('sidebar-item-row--active')
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

  it('puts New agent and Add folder on the workspace header', () => {
    const { props } = renderSidebar()

    const header = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-project-row')
    fireEvent.click(within(header!).getByRole('button', { name: 'Add agent to alpha-space' }))
    fireEvent.click(within(header!).getByRole('button', { name: 'Add folder to alpha-space' }))

    expect(props.onNewAgent).toHaveBeenCalledWith('p1', 'w1')
    expect(props.onAddProjectToWorkspace).toHaveBeenCalledWith('w1')
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

  it('calls onRequestDeleteAgent with the worktree home folder path', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Delete oslo'))

    expect(props.onRequestDeleteAgent).toHaveBeenCalledTimes(1)
    const [session, projectPath] = props.onRequestDeleteAgent.mock.calls[0]
    expect(session.id).toBe('s1')
    expect(projectPath).toBe('/repos/alpha')
  })

  it('does not trigger onSelectSession when delete is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Delete oslo'))

    expect(props.onSelectSession).not.toHaveBeenCalled()
  })

  it('collapses agents sharing a worktree into a single row', () => {
    const siblings: AgentSession[] = [
      { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
      { id: 's9', projectId: 'p1', runtimeId: 'codex', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'running', pid: 9, additionalDirs: [] },
    ]

    renderSidebar({ sessionsByWorkspace: { w1: siblings, w2: [] } })

    expect(screen.getAllByText('oslo')).toHaveLength(1)
  })

  it('keeps finished worktrees visible', () => {
    const finished: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'done', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ sessionsByWorkspace: { w1: sampleSessions, w2: finished } })

    expect(screen.getByText('stavanger')).toBeInTheDocument()
  })

  it('keeps stripping legacy manifold-prefixed branch names', () => {
    const legacy: AgentSession[] = [
      { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
    ]

    renderSidebar({ sessionsByWorkspace: { w1: legacy, w2: [] } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
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
