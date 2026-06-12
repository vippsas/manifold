import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
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
  it('renders project names', () => {
    renderSidebar()

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    // Inactive repos are collapsed by default — expand to see them
    fireEvent.click(screen.getByText('Repositories'))
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows "No repositories yet" when list is empty', () => {
    renderSidebar({ projects: [] })

    expect(screen.getByText('No repositories yet')).toBeInTheDocument()
  })

  it('shows agents for active project and mini dots for collapsed projects', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    // Active project (p1) shows expanded agent names
    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()

    // Collapsed project (p2) shows project name but not agent names
    expect(screen.getByText('Beta')).toBeInTheDocument()
    // Agent name is available as a title on the mini dot
    expect(screen.getByTitle('beta/stavanger')).toBeInTheDocument()
  })

  it('calls onSelectProject when a project is clicked', () => {
    const { props } = renderSidebar()

    // Expand collapsed repos section first
    fireEvent.click(screen.getByText('Repositories'))
    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectProject).toHaveBeenCalledWith('p2')
  })

  it('calls onNewProject when New Repository button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Repository'))

    expect(props.onNewProject).toHaveBeenCalled()
  })

  it('calls onRemoveProject when remove button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Remove Alpha'))

    expect(props.onRemoveProject).toHaveBeenCalledWith('p1')
  })

  it('renders the New Agent button in actions bar', () => {
    renderSidebar()

    expect(screen.getByText('+ New Agent')).toBeInTheDocument()
  })

  it('renders agent branch names under the active project', () => {
    renderSidebar()

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()
  })

  it('renders agent runtime labels', () => {
    renderSidebar()

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  it('calls onSelectSession with sessionId and projectId when an agent item is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('bergen'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s2', 'p1')
  })

  it('renders a single + New Agent button in the actions bar', () => {
    renderSidebar()

    const newAgentButtons = screen.getAllByText('+ New Agent')
    expect(newAgentButtons).toHaveLength(1)
  })

  it('calls onNewAgent with no arguments when + New Agent is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })

  it('fetches a workspace repo from its refresh button', () => {
    const onFetchProject = vi.fn()
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
      onFetchProject,
    })

    fireEvent.click(screen.getByLabelText('Fetch Alpha'))

    expect(onFetchProject).toHaveBeenCalledWith('p1')
  })

  it('renders an active workspace as a labeled card with a Workspace eyebrow', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })

  it('shows a repo count on a collapsed workspace', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.getByText('2 repos')).toBeInTheDocument()
  })

  it('shows the + button beside the Workspaces label even when there are no workspaces', () => {
    const { props } = renderSidebar({
      workspaces: [],
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.queryByText('+ New Workspace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('New Workspace'))
    expect(props.onNewWorkspace).toHaveBeenCalled()
  })

  it('labels the primary button with the active workspace and opens the New-Agent form', () => {
    const onSpawnWorkspaceAgent = vi.fn()
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent,
    })

    fireEvent.click(screen.getByText('+ New Agent in auth-refactor'))

    expect(props.onNewAgent).toHaveBeenCalled()
    expect(onSpawnWorkspaceAgent).not.toHaveBeenCalled()
  })

  it('selecting a workspace repo calls onSelectWorkspaceRepo and no longer shows a play button', () => {
    const onSelectWorkspaceRepo = vi.fn()
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
      onSelectWorkspaceRepo,
      suppressedProjectIds: new Set(['p1', 'p2']),
    })

    expect(screen.queryByLabelText('Start agent in Alpha')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Alpha'))
    expect(onSelectWorkspaceRepo).toHaveBeenCalledWith('ws1', 'p1')
  })

  it('keeps the plain + New Agent label and handler when no workspace is active', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })

  it('highlights the active agent item', () => {
    renderSidebar({ activeSessionId: 's1' })

    const agentButton = screen.getByTitle('Claude - alpha/oslo')
    expect(agentButton).toHaveClass('sidebar-item-row--active')
  })

  it('calls onRequestDeleteAgent when agent delete button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Delete oslo'))

    expect(props.onRequestDeleteAgent).toHaveBeenCalledTimes(1)
    const [session, projectPath] = props.onRequestDeleteAgent.mock.calls[0]
    expect(session.id).toBe('s1')
    expect(projectPath).toBe('/repos/alpha')
  })

  it('does not trigger onSelectSession when delete button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Delete oslo'))

    expect(props.onSelectSession).not.toHaveBeenCalled()
  })

  it('renders delete button for each agent', () => {
    renderSidebar()

    expect(screen.getByLabelText('Delete oslo')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete bergen')).toBeInTheDocument()
  })

  it('selects first session when clicking a collapsed project with agents', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    const { props } = renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    // Collapsed project row is clickable — selects the first session
    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s3', 'p2')
  })

  it('keeps stripping legacy manifold-prefixed branch names', () => {
    const legacySessions: AgentSession[] = [
      { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: legacySessions, p2: [] } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
  })

  it('suppresses projects in suppressedProjectIds from the standard sections', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({
      allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 },
      suppressedProjectIds: new Set(['p2']),
    })

    // p2 is suppressed — its name is gone from the list
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    // the active project's own agents still render (now under "With agents")
    expect(screen.getByText('oslo')).toBeInTheDocument()
  })

  it('places the active repo with agents under the "With agents" header', () => {
    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: [] } })

    const header = screen.getByText('With agents')
    const activeAgent = screen.getByText('oslo')
    // The active repo's card + agents render AFTER the section header
    expect(
      header.compareDocumentPosition(activeAgent) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('collapses the With agents section to a header-only row', () => {
    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: [] } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByTitle('Collapse With agents')).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByTitle('Collapse With agents'))

    expect(screen.getByText('With agents')).toBeInTheDocument()
    expect(screen.queryByText('oslo')).not.toBeInTheDocument()
    expect(screen.getByTitle('Expand With agents')).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByTitle('Expand With agents'))

    expect(screen.getByText('oslo')).toBeInTheDocument()
  })

  it('restores persisted section collapsed states after remount', () => {
    const { unmount } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
    })

    fireEvent.click(screen.getByTitle('Collapse Workspaces'))
    fireEvent.click(screen.getByTitle('Collapse With agents'))
    fireEvent.click(screen.getByTitle('Expand Repositories'))
    unmount()

    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
    })

    expect(screen.getByTitle('Expand Workspaces')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('auth-refactor')).not.toBeInTheDocument()
    expect(screen.getByTitle('Expand With agents')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('oslo')).not.toBeInTheDocument()
    expect(screen.getByTitle('Collapse Repositories')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('keeps the active repo pinned above the sections when it has no agents', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ activeProjectId: 'p1', allProjectSessions: { p1: [], p2: sessionsForP2 } })

    const activeName = screen.getByText('Alpha')
    const header = screen.getByText('With agents')
    // The active (agent-less) repo card sits BEFORE the "With agents" header
    expect(
      activeName.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not highlight the home repo as an active standalone project while a workspace session is active', () => {
    // A workspace session is shown under its workspace; its home repo must not
    // ALSO appear as an active (highlighted) standalone project in the list —
    // otherwise a workspace and a repo look selected at the same time.
    const workspaceSession: AgentSession = {
      id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo',
      worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [], workspaceId: 'ws1',
    }

    renderSidebar({
      activeProjectId: 'p1',
      activeSessionId: 's1',
      allProjectSessions: { p1: [workspaceSession], p2: [] },
      workspaces: [{ id: 'ws1', name: 'MANIFOLD-WS', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      sessionsByWorkspace: { ws1: [workspaceSession] },
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    // The active ProjectItem (and only it) renders a "Remove <name>" button;
    // its absence means the home repo is no longer doubly highlighted.
    expect(screen.queryByLabelText('Remove Alpha')).not.toBeInTheDocument()
  })

  it('renames the active project on double-click and Enter', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('Alpha'))
    const input = screen.getByLabelText('Repository name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateProject).toHaveBeenCalledWith('p1', { name: 'Renamed' })
  })

  it('discards the rename on Escape', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('Alpha'))
    const input = screen.getByLabelText('Repository name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(props.onUpdateProject).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('ignores a blank or unchanged rename', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('Alpha'))
    const input = screen.getByLabelText('Repository name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateProject).not.toHaveBeenCalled()
  })

  it('renders a draft chat row when drafts are present for the active project', () => {
    renderSidebar({
      drafts: [{ id: 'draft-1' as DraftId, projectId: 'p1', runtimeId: 'claude' }],
    })

    expect(screen.getByText('New chat')).toBeInTheDocument()
  })

  it('renders a + button beside the Workspaces label that calls onNewWorkspace', () => {
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    fireEvent.click(screen.getByLabelText('New Workspace'))

    expect(props.onNewWorkspace).toHaveBeenCalled()
  })

  it('collapses the Workspaces section while keeping its header action available', () => {
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
    })

    expect(screen.getByText('auth-refactor')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Collapse Workspaces'))

    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.queryByText('auth-refactor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('New Workspace'))
    expect(props.onNewWorkspace).toHaveBeenCalled()

    fireEvent.click(screen.getByTitle('Expand Workspaces'))

    expect(screen.getByText('auth-refactor')).toBeInTheDocument()
  })
})
