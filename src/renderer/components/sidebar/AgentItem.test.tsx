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

    fireEvent.click(screen.getByRole('button', { name: 'Rename oslo' }))
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
