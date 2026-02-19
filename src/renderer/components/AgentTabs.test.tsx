import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AgentTabs } from './AgentTabs'
import type { AgentSession } from '../../shared/types'

const sampleSessions: AgentSession[] = [
  {
    id: 's1',
    projectId: 'p1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/wt1',
    status: 'running',
    pid: 1,
  },
  {
    id: 's2',
    projectId: 'p1',
    runtimeId: 'codex',
    branchName: 'manifold/bergen',
    worktreePath: '/wt2',
    status: 'waiting',
    pid: 2,
  },
]

function renderTabs(overrides = {}) {
  const defaultProps = {
    sessions: sampleSessions,
    activeSessionId: 's1',
    onSelectSession: vi.fn(),
    onNewAgent: vi.fn(),
    ...overrides,
  }

  return { ...render(<AgentTabs {...defaultProps} />), props: defaultProps }
}

describe('AgentTabs', () => {
  it('renders a tab for each session', () => {
    renderTabs()

    // Branch names with manifold/ stripped
    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()
  })

  it('displays runtime labels', () => {
    renderTabs()

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  it('calls onSelectSession when a tab is clicked', () => {
    const { props } = renderTabs()

    fireEvent.click(screen.getByText('bergen'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s2')
  })

  it('renders the New Agent button', () => {
    renderTabs()

    expect(screen.getByText('+ New Agent')).toBeInTheDocument()
  })

  it('calls onNewAgent when New Agent button is clicked', () => {
    const { props } = renderTabs()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })

  it('shows active tab with accent styling', () => {
    renderTabs({ activeSessionId: 's1' })

    // The active tab button should have a specific border style
    const tabButton = screen.getByTitle('Claude - manifold/oslo')
    expect(tabButton.style.borderBottom).toContain('var(--accent)')
  })

  it('shows inactive tab without accent styling', () => {
    renderTabs({ activeSessionId: 's1' })

    const tabButton = screen.getByTitle('Codex - manifold/bergen')
    expect(tabButton.style.borderBottom).toContain('transparent')
  })

  it('falls back to runtime id for unknown runtime labels', () => {
    const sessions: AgentSession[] = [
      {
        id: 's3',
        projectId: 'p1',
        runtimeId: 'unknown-runtime',
        branchName: 'manifold/trondheim',
        worktreePath: '/wt3',
        status: 'running',
        pid: 3,
      },
    ]

    renderTabs({ sessions })

    expect(screen.getByText('unknown-runtime')).toBeInTheDocument()
  })

  it('renders empty state with only the new agent button', () => {
    renderTabs({ sessions: [] })

    expect(screen.getByText('+ New Agent')).toBeInTheDocument()
    expect(screen.queryByText('oslo')).not.toBeInTheDocument()
  })
})
