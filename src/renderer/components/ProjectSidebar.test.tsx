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
    onSelectProject: vi.fn(),
    onAddProject: vi.fn(),
    onRemoveProject: vi.fn(),
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

  it('shows session count badge for projects with active sessions', () => {
    renderSidebar()

    // Project p1 has 2 sessions
    expect(screen.getByText('2')).toBeInTheDocument()
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
})
