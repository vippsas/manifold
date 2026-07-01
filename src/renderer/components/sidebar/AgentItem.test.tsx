import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { AgentItem } from './AgentItem'
import type { AgentSession } from '../../../shared/types'

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/tmp/oslo',
    status: 'running',
    pid: 1234,
    additionalDirs: [],
    ...overrides,
  }
}

describe('AgentItem chat glyph', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    isOutputting: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('does not render the chat glyph for an interactive session', () => {
    render(<AgentItem {...baseProps} session={makeSession()} />)
    expect(screen.queryByLabelText('Chat agent')).not.toBeInTheDocument()
  })

  it('renders the chat glyph for a nonInteractive session', () => {
    render(<AgentItem {...baseProps} session={makeSession({ nonInteractive: true })} />)
    expect(screen.getByLabelText('Chat agent')).toBeInTheDocument()
  })
})

describe('AgentItem in-place badge', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    isOutputting: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders the in-place badge for a no-worktree session', () => {
    render(<AgentItem {...baseProps} session={makeSession({ noWorktree: true })} />)
    expect(screen.getByText('in-place')).toBeInTheDocument()
  })

  it('does not render the in-place badge for a worktree session', () => {
    render(<AgentItem {...baseProps} session={makeSession()} />)
    expect(screen.queryByText('in-place')).not.toBeInTheDocument()
  })
})

describe('AgentItem rename', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    isOutputting: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('uses displayName as the primary label when present', () => {
    render(<AgentItem {...baseProps} session={makeSession({ displayName: 'Release agent' })} />)

    expect(screen.getByText('Release agent')).toBeInTheDocument()
    expect(screen.getByTitle('Release agent - manifold/oslo')).toBeInTheDocument()
  })

  it('commits a renamed agent label from the inline editor', () => {
    const onRename = vi.fn()
    render(<AgentItem {...baseProps} session={makeSession()} onRename={onRename} />)

    fireEvent.doubleClick(screen.getByText('oslo'))
    const input = screen.getByLabelText('Agent name')
    fireEvent.change(input, { target: { value: 'Release agent' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRename).toHaveBeenCalledWith('Release agent')
  })
})

describe('AgentItem sensor sweep', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('adds the outputting modifier while the agent streams output', () => {
    const { container } = render(<AgentItem {...baseProps} isOutputting session={makeSession()} />)
    expect(container.querySelector('.sidebar-agent-row')).toHaveClass('sidebar-agent-row--outputting')
  })

  it('omits the outputting modifier when idle', () => {
    const { container } = render(<AgentItem {...baseProps} isOutputting={false} session={makeSession()} />)
    expect(container.querySelector('.sidebar-agent-row')).not.toHaveClass('sidebar-agent-row--outputting')
  })
})

describe('AgentItem lock', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    isOutputting: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders a lock indicator for a locked session', () => {
    render(<AgentItem {...baseProps} session={makeSession({ locked: true })} />)
    expect(screen.getByLabelText('Locked')).toBeInTheDocument()
  })

  it('omits the lock indicator when unlocked', () => {
    render(<AgentItem {...baseProps} session={makeSession()} />)
    expect(screen.queryByLabelText('Locked')).not.toBeInTheDocument()
  })

  it('disables the delete button and ignores clicks while locked', () => {
    const onDelete = vi.fn()
    render(<AgentItem {...baseProps} onDelete={onDelete} session={makeSession({ locked: true })} />)
    const del = screen.getByRole('button', { name: 'oslo is locked — unlock to delete' })
    expect(del).toBeDisabled()
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('keeps the delete button active when unlocked', () => {
    const onDelete = vi.fn()
    render(<AgentItem {...baseProps} onDelete={onDelete} session={makeSession()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete oslo' }))
    expect(onDelete).toHaveBeenCalled()
  })
})
