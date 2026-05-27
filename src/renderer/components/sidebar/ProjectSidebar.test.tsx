import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar } from './ProjectSidebar'
import type { Project, AgentSession } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import type { DraftId } from '../../../shared/draft-chat'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

const sampleProjects: Project[] = [
  { id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Beta', path: '/repos/beta', baseBranch: 'main', addedAt: '2024-01-02' },
]

const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'alpha/bergen', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
]

const sampleSuperagent: Superagent = {
  id: 'sa-1',
  name: '123',
  taskDescription: '',
  runtimeId: 'codex',
  fleetProjectIds: ['p1'],
  fleetWorktreePaths: { p1: '/wt2' },
  branchName: 'manifold/123',
  childSessionIds: ['s2'],
  coordinationPath: '/coordination',
  createdAt: '2024-01-01T00:00:00.000Z',
  pid: 1,
  status: 'running',
  autoApprove: false,
}

function renderSidebar(overrides = {}) {
  const defaultProps = {
    width: 200,
    projects: sampleProjects,
    activeProjectId: 'p1',
    allProjectSessions: { p1: sampleSessions, p2: [] },
    activeSessionId: 's1',
    outputtingSessionIds: new Set<string>(),
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onRequestDeleteAgent: vi.fn(),
    onNewAgent: vi.fn(),
    onNewProject: vi.fn(),
    fetchingProjectId: null,
    lastFetchedProjectId: null,
    fetchResult: null,
    fetchError: null,
    onFetchProject: vi.fn(),
    drafts: [],
    activeDraftId: null,
    onSelectDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    ...overrides,
  }

  return { ...render(<ProjectSidebar {...defaultProps} />), props: defaultProps }
}

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

  it('marks superagent child clicks so they stay in superagent context', () => {
    const superagentSessions: AgentSession[] = [
      { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/123', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
    ]
    const { props } = renderSidebar({
      allProjectSessions: { p1: superagentSessions, p2: [] },
      superagents: [sampleSuperagent],
      activeSuperagentId: 'sa-1',
      onSelectSuperagent: vi.fn(),
      onRemoveSuperagent: vi.fn(),
      onSpawnFleetAgent: vi.fn(),
    })

    fireEvent.click(screen.getByTitle('Codex - manifold/123'))

    expect(props.onSelectSession).toHaveBeenCalledWith(
      's2',
      'p1',
      { preserveSuperagent: true },
    )
  })

  it('hides fleet-owned projects and their sessions from the standard repository sections', () => {
    const childOnlySessions: AgentSession[] = [
      { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/123', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
    ]
    renderSidebar({
      activeProjectId: 'p2',
      allProjectSessions: { p1: childOnlySessions, p2: [] },
      superagents: [sampleSuperagent],
      onSelectSuperagent: vi.fn(),
    })

    expect(screen.queryByText('With agents')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Codex - manifold/123')).not.toBeInTheDocument()
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('hides dormant fleet worktrees from the standard repository sections before a child agent is started', () => {
    const reservedFleetSuperagent: Superagent = {
      ...sampleSuperagent,
      childSessionIds: [],
    }
    const dormantFleetSessions: AgentSession[] = [
      { id: 's-fleet', projectId: 'p1', runtimeId: '', branchName: 'manifold/123', worktreePath: '/wt2', status: 'done', pid: null, additionalDirs: [] },
    ]

    renderSidebar({
      activeProjectId: 'p2',
      allProjectSessions: { p1: dormantFleetSessions, p2: [] },
      superagents: [reservedFleetSuperagent],
      onSelectSuperagent: vi.fn(),
    })

    expect(screen.queryByText('With agents')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('offers a plus action to add repositories to an active superagent', () => {
    const onRequestAddProjectToSuperagent = vi.fn()

    renderSidebar({
      superagents: [sampleSuperagent],
      activeSuperagentId: 'sa-1',
      onSelectSuperagent: vi.fn(),
      onRequestAddProjectToSuperagent,
    })

    fireEvent.click(screen.getByLabelText('Add repository to 123'))

    expect(onRequestAddProjectToSuperagent).toHaveBeenCalledWith('sa-1')
  })

  it('suppresses projects that are pending superagent assignment from the standard sections', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'beta/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({
      allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 },
      suppressedProjectIds: new Set(['p2']),
    })

    expect(screen.queryByText('With agents')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('renders a draft chat row when drafts are present for the active project', () => {
    renderSidebar({
      drafts: [{ id: 'draft-1' as DraftId, projectId: 'p1', runtimeId: 'claude' }],
    })

    expect(screen.getByText('New chat')).toBeInTheDocument()
  })
})
