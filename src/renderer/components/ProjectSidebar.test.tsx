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
    on: vi.fn(),
    off: vi.fn(),
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call off() during unmount cleanup
})

const sampleProjects: Project[] = [
  { id: 'p1', name: 'Alpha', path: '/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Beta', path: '/beta', baseBranch: 'main', addedAt: '2024-01-02' },
]

const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo', worktreePath: '/wt1', status: 'running', pid: 1 },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/bergen', worktreePath: '/wt2', status: 'waiting', pid: 2 },
]

function renderSidebar(overrides = {}) {
  const defaultProps = {
    projects: sampleProjects,
    activeProjectId: 'p1',
    sessions: sampleSessions,
    activeSessionId: 's1',
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onAddProject: vi.fn(),
    onRemoveProject: vi.fn(),
    onNewAgent: vi.fn(),
    onOpenSettings: vi.fn(),
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

  it('shows "No projects yet" when list is empty', () => {
    renderSidebar({ projects: [] })

    expect(screen.getByText('No projects yet')).toBeInTheDocument()
  })

  it('shows session count badge for non-active projects with sessions', () => {
    const sessionsWithP2: AgentSession[] = [
      ...sampleSessions,
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'manifold/stavanger', worktreePath: '/wt3', status: 'running', pid: 3 },
    ]

    renderSidebar({ sessions: sessionsWithP2 })

    // Non-active project p2 has 1 session shown as badge
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('calls onSelectProject when a project is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectProject).toHaveBeenCalledWith('p2')
  })

  it('calls onAddProject when Add button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ Add'))

    expect(props.onAddProject).toHaveBeenCalled()
  })

  it('calls onOpenSettings when gear button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Settings'))

    expect(props.onOpenSettings).toHaveBeenCalled()
  })

  it('shows clone input when Clone button is clicked', () => {
    renderSidebar()

    const cloneButton = screen.getByText('Clone')
    fireEvent.click(cloneButton)

    expect(screen.getByPlaceholderText('Git URL...')).toBeInTheDocument()
  })

  it('hides clone input when Clone button is clicked again', () => {
    renderSidebar()

    const cloneButton = screen.getByText('Clone')
    fireEvent.click(cloneButton)
    expect(screen.getByPlaceholderText('Git URL...')).toBeInTheDocument()

    fireEvent.click(cloneButton)
    expect(screen.queryByPlaceholderText('Git URL...')).not.toBeInTheDocument()
  })

  it('calls onRemoveProject when remove button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Remove Alpha'))

    expect(props.onRemoveProject).toHaveBeenCalledWith('p1')
  })

  it('renders the settings button', () => {
    renderSidebar()

    expect(screen.getByLabelText('Settings')).toBeInTheDocument()
  })

  it('renders the Projects header', () => {
    renderSidebar()

    expect(screen.getByText('Projects')).toBeInTheDocument()
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

  it('calls onSelectSession when an agent item is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('bergen'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s2')
  })

  it('renders + New Agent button under active project', () => {
    renderSidebar()

    expect(screen.getByText('+ New Agent')).toBeInTheDocument()
  })

  it('calls onNewAgent when + New Agent is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })

  it('highlights the active agent item', () => {
    renderSidebar({ activeSessionId: 's1' })

    const agentButton = screen.getByTitle('Claude - manifold/oslo')
    expect(agentButton.style.background).toContain('var(--bg-input)')
  })

  it('does not show agents for non-active projects', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'manifold/stavanger', worktreePath: '/wt3', status: 'running', pid: 3 },
    ]

    renderSidebar({ sessions: [...sampleSessions, ...sessionsForP2] })

    expect(screen.queryByText('stavanger')).not.toBeInTheDocument()
  })

  it('hides session count badge for the active project', () => {
    renderSidebar()

    // Active project p1 shows agents inline, not a count badge
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})
