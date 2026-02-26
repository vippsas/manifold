import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar } from './ProjectSidebar'
import type { Project, AgentSession } from '../../shared/types'

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
  { id: 'p1', name: 'Alpha', path: '/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Beta', path: '/beta', baseBranch: 'main', addedAt: '2024-01-02' },
]

const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/bergen', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
]

function renderSidebar(overrides = {}) {
  const defaultProps = {
    width: 200,
    projects: sampleProjects,
    activeProjectId: 'p1',
    allProjectSessions: { p1: sampleSessions, p2: [] },
    activeSessionId: 's1',
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onDeleteAgent: vi.fn(),
    onNewAgent: vi.fn(),
    onNewProject: vi.fn(),
    ...overrides,
  }

  return { ...render(<ProjectSidebar {...defaultProps} />), props: defaultProps }
}

describe('ProjectSidebar', () => {
  it('renders project names', () => {
    renderSidebar()

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows "No repositories yet" when list is empty', () => {
    renderSidebar({ projects: [] })

    expect(screen.getByText('No repositories yet')).toBeInTheDocument()
  })

  it('shows agents for all projects', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'manifold/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()
    expect(screen.getByText('stavanger')).toBeInTheDocument()
  })

  it('calls onSelectProject when a project is clicked', () => {
    const { props } = renderSidebar()

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

    const agentButton = screen.getByTitle('Claude - manifold/oslo')
    expect(agentButton.style.background).toContain('rgba(79, 195, 247, 0.15)')
  })

  it('calls onDeleteAgent when agent delete button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Delete oslo'))

    expect(props.onDeleteAgent).toHaveBeenCalledWith('s1')
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

  it('calls onSelectSession with correct projectId for cross-project agent click', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'manifold/stavanger', worktreePath: '/wt3', status: 'running', pid: 3, additionalDirs: [] },
    ]

    const { props } = renderSidebar({ allProjectSessions: { p1: sampleSessions, p2: sessionsForP2 } })

    fireEvent.click(screen.getByText('stavanger'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s3', 'p2')
  })

  it('renders a gear icon for each project', () => {
    renderSidebar()

    expect(screen.getByLabelText('Settings for Alpha')).toBeInTheDocument()
    expect(screen.getByLabelText('Settings for Beta')).toBeInTheDocument()
  })

  it('opens project settings popover when gear icon is clicked', () => {
    renderSidebar()

    fireEvent.click(screen.getByLabelText('Settings for Alpha'))

    expect(screen.getByText('Auto-generate AI messages')).toBeInTheDocument()
  })

  it('calls onUpdateProject when toggling auto-generate checkbox', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Settings for Alpha'))
    fireEvent.click(screen.getByLabelText('Auto-generate AI messages'))

    expect(props.onUpdateProject).toHaveBeenCalledWith('p1', { autoGenerateMessages: false })
  })

  it('closes popover when overlay is clicked', () => {
    renderSidebar()

    fireEvent.click(screen.getByLabelText('Settings for Alpha'))
    expect(screen.getByText('Auto-generate AI messages')).toBeInTheDocument()

    // The overlay is rendered as a fixed div — find and click it
    const overlay = screen.getByText('Auto-generate AI messages').parentElement!.previousElementSibling!
    fireEvent.click(overlay)

    expect(screen.queryByText('Auto-generate AI messages')).not.toBeInTheDocument()
  })
})
