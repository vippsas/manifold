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
  it('renders project names', () => {
    renderSidebar()

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument()
  })

  it('shows "No repositories yet" when list is empty', () => {
    renderSidebar({ projects: [] })

    expect(screen.getByText('No repositories yet')).toBeInTheDocument()
  })

  it('does not claim "No repositories yet" when every repo lives in a workspace', () => {
    // Repos inside workspaces are suppressed from the standalone list; the
    // empty state must not render under a sidebar full of workspace repos.
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
    })

    expect(screen.queryByText('No repositories yet')).not.toBeInTheDocument()
  })

  it('does not render a manual refresh action for repositories', () => {
    renderSidebar({
      projects: [{ id: 'p1', name: 'Alpha', path: '/a', baseBranch: 'main', kind: 'git' }],
      activeProjectId: 'p1',
      allProjectSessions: { p1: [] },
      activeSessionId: null,
    })

    expect(screen.queryByRole('button', { name: /Fetch Alpha/ })).not.toBeInTheDocument()
  })

  it('keeps agents visible in every repository card', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('stavanger')).toBeInTheDocument()
  })

  it('calls onSelectProject when a project is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectProject).toHaveBeenCalledWith('p2')
  })

  it('selects the repository when the active repo header is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('Alpha'))

    expect(props.onSelectProject).toHaveBeenCalledWith('p1')
    expect(props.onNewAgent).not.toHaveBeenCalled()
  })

  it('calls onNewProject when Add Repository is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Add Repository' }))

    expect(props.onNewProject).toHaveBeenCalled()
  })

  it('calls onRemoveProject when remove button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Remove Alpha'))

    expect(props.onRemoveProject).toHaveBeenCalledWith('p1')
  })

  it('renders only Add Repository in the compact top toolbar', () => {
    renderSidebar()

    const toolbar = screen.getByRole('toolbar', { name: 'Repository actions' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Add Repository'])
    expect(screen.queryByText('+ New Agent')).not.toBeInTheDocument()
    expect(screen.queryByText('+ New Repository')).not.toBeInTheDocument()
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

  it('keeps Add agent and Add folder on the repository row itself', () => {
    renderSidebar()

    const projectHeader = screen.getByText('Alpha').closest<HTMLElement>('.sidebar-project-row')
    expect(projectHeader).not.toBeNull()
    expect(within(projectHeader!).getByRole('button', { name: 'Add agent to Alpha' })).toBeInTheDocument()
    expect(within(projectHeader!).getByRole('button', { name: 'Add folder to Alpha' })).toBeInTheDocument()
  })

  it('opens the new-agent modal when New Agent is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Add agent to Alpha' }))

    expect(props.onNewAgent).toHaveBeenCalledWith('p1')
    expect(screen.queryByRole('button', { name: 'Configure new agent in Alpha' })).not.toBeInTheDocument()
  })

  it('promotes a one-repository box when Add folder is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Add folder to Alpha' }))

    expect(props.onCreateWorkspaceFromProject).toHaveBeenCalledWith('p1')
  })

  it('does not render a manual refresh action for workspace repositories', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.queryByRole('button', { name: /Fetch Alpha/ })).not.toBeInTheDocument()
  })

  it('does not render favorite buttons on repository or workspace cards', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
    })

    expect(screen.queryByLabelText(/to Favorites/)).not.toBeInTheDocument()
  })

  it('renders an active workspace by name alongside its repositories', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.getByText('auth-refactor')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('keeps Add folder in the workspace header and Add agent at the bottom', () => {
    const onAddProjectToWorkspace = vi.fn()
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onAddProjectToWorkspace,
    })

    const workspaceCard = screen.getByText('auth-refactor').closest<HTMLElement>('.sidebar-workspace-card')
    expect(workspaceCard).not.toBeNull()
    const addAgent = within(workspaceCard!).getByRole('button', { name: 'Add agent to auth-refactor' })
    const workspaceHeader = within(workspaceCard!).getByText('auth-refactor').closest<HTMLElement>('.sidebar-project-row')
    expect(workspaceHeader).not.toBeNull()
    const addFolder = within(workspaceHeader!).getByRole('button', { name: 'Add folder to auth-refactor' })

    fireEvent.click(addAgent)
    fireEvent.click(addFolder)

    expect(props.onNewAgent).toHaveBeenCalledWith('p1', 'ws1')
    expect(onAddProjectToWorkspace).toHaveBeenCalledWith('ws1')
  })

  it('always offers Add folder even when every registered project is already in the workspace', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onAddProjectToWorkspace: vi.fn(),
    })

    expect(screen.getByRole('button', { name: 'Add folder to auth-refactor' })).toBeInTheDocument()
  })

  it('keeps every repository visible in an inactive workspace', () => {
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows New Workspace below the cards even when there are no workspaces', () => {
    const { props } = renderSidebar({
      workspaces: [],
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'New Workspace' }))
    expect(props.onNewWorkspace).toHaveBeenCalled()
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

  it('opens creation from the repository card when no workspace is active', () => {
    const { props } = renderSidebar()

    const newAgentButton = screen.getByRole('button', { name: 'Add agent to Alpha' })
    fireEvent.click(newAgentButton)

    expect(props.onNewAgent).toHaveBeenCalledWith('p1')
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

  it('selects the project (not a forced first session) when clicking another open project card', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    const { props } = renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    // Clicking the repo only activates the project; the session-restore
    // path (useAgentSession) then picks the last-viewed agent for that repo
    // instead of being reset to the first one (#768).
    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectProject).toHaveBeenCalledWith('p2')
    expect(props.onSelectSession).not.toHaveBeenCalled()
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
    // the active project's own agents still render inside its card
    expect(screen.getByText('oslo')).toBeInTheDocument()
  })

  it('places the active repo and its agents in one bordered card', () => {
    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: [] } })

    const card = screen.getByText('Alpha').closest('.sidebar-project-group')
    expect(card).toHaveClass('sidebar-project-group--has-agents')
    expect(within(card as HTMLElement).getByText('oslo')).toBeInTheDocument()
  })

  it('shows repositories directly without collapsible category headers', () => {
    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: [] } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('With agents')).not.toBeInTheDocument()
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument()
  })

  it('moves a repo to the top of the flat card list when it is accessed', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    // Untouched: incoming alphabetical order — Alpha before Beta
    const alpha = screen.getByText('Alpha')
    let beta = screen.getByText('Beta')
    expect(alpha.compareDocumentPosition(beta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Accessing Beta moves it above Alpha; Alpha holds its slot
    fireEvent.click(beta)
    beta = screen.getByText('Beta')
    expect(beta.compareDocumentPosition(screen.getByText('Alpha')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps an active repo with no agents in a bordered card', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ activeProjectId: 'p1', allProjectSessions: { p1: [], p2: sessionsForP2 } })

    expect(screen.getByText('Alpha').closest('.sidebar-project-group')).toHaveClass('sidebar-project-group--has-agents')
    expect(screen.getByText('Beta').closest('.sidebar-project-group')).toHaveClass('sidebar-project-group--has-agents')
  })

  it('keeps finished agents visible in their repository card', () => {
    const finishedSessions: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'done', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: finishedSessions } })

    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('stavanger')).toBeInTheDocument()
  })

  it('keeps an active repo card visible when its agents have finished', () => {
    const finishedActive: AgentSession[] = [
      { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'error', pid: 1, additionalDirs: [] },
    ]
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ activeProjectId: 'p1', allProjectSessions: { p1: finishedActive, p2: sessionsForP2 } })

    expect(screen.getByText('Alpha').closest('.sidebar-project-group')).toHaveClass('sidebar-project-group--has-agents')
    expect(screen.getByText('Beta')).toBeInTheDocument()
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

  it('renders a New Workspace list action that calls onNewWorkspace', () => {
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

  it('keeps workspace cards visible without a collapsible section header', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      onSelectWorkspace,
      onRemoveWorkspace: vi.fn(),
    })

    fireEvent.click(screen.getByText('auth-refactor'))
    expect(onSelectWorkspace).toHaveBeenCalledWith('ws1')
    // A static "Workspaces" section label exists, but it is not a collapse control.
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workspaces' })).not.toBeInTheDocument()
  })
})
