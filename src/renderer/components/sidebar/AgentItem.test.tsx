import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('AgentItem settings', () => {
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

  it('opens a modal from the settings gear and saves a new name', async () => {
    const onRename = vi.fn(async () => undefined)
    render(<AgentItem {...baseProps} session={makeSession()} onRename={onRename} />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings for oslo' }))
    expect(screen.getByRole('dialog', { name: 'Agent settings for oslo' })).toBeInTheDocument()
    const input = screen.getByLabelText('Agent name')
    fireEvent.change(input, { target: { value: 'Release agent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onRename).toHaveBeenCalledWith({
      displayName: 'Release agent',
      runtimeId: 'claude',
      viewMode: 'terminal',
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Agent settings for oslo' })).not.toBeInTheDocument()
    })
  })

  it('saves runtime and view choices from agent settings', async () => {
    const onRename = vi.fn(async () => undefined)
    render(<AgentItem {...baseProps} session={makeSession()} onRename={onRename} />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings for oslo' }))
    fireEvent.change(screen.getByLabelText('Agent runtime'), { target: { value: 'codex' } })
    fireEvent.click(screen.getByRole('radio', { name: /Chat UI/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Start a new agent?')).toBeInTheDocument()
    expect(onRename).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start New Agent' }))

    expect(onRename).toHaveBeenCalledWith({
      displayName: 'oslo',
      runtimeId: 'codex',
      viewMode: 'chat',
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Agent settings for oslo' })).not.toBeInTheDocument()
    })
  })

  it('does not render a lock action or indicator', () => {
    render(<AgentItem {...baseProps} session={makeSession({ locked: true })} onRename={vi.fn()} />)

    expect(screen.queryByLabelText('Locked')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lock/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete oslo' })).toBeEnabled()
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
