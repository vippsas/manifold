import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import {
  installElectronApi,
  mockInvoke,
  renderSidebar,
  sampleProjects,
  sampleSessions,
  sampleSuperagent,
} from './ProjectSidebar.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
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
})
