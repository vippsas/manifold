import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewAgentModal } from './NewAgentModal'

const workspace = {
  id: 'w1',
  name: 'Checkout',
  projectIds: ['p1', 'p2'],
  createdAt: '2026-07-13',
  branchName: 'manifold/checkout',
  worktreePaths: { p1: '/worktrees/checkout/storefront' },
}

const baseProps = {
  visible: true,
  workspace,
  defaultRuntime: 'claude',
  defaultAgentMode: 'interactive' as const,
  onLaunch: vi.fn(async () => ({ id: 'session-1' })),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn(async (channel: string) => channel === 'runtimes:list'
      ? [{ id: 'claude', name: 'Claude', binary: 'claude', installed: true }]
      : false),
    on: vi.fn(() => vi.fn()),
  }
})

describe('NewAgentModal', () => {
  // The dialog is aimed at a workspace, never at one of its folders: the name
  // names the agent, and the launch says nothing about where it will run.
  it('launches into the workspace and closes after a successful start', async () => {
    render(<NewAgentModal {...baseProps} />)

    expect(screen.getByRole('dialog', { name: 'New agent in Checkout' })).toBeInTheDocument()
    expect(screen.getByText('Checkout')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Agent name/), { target: { value: 'Fix checkout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Agent' }))

    await waitFor(() => expect(baseProps.onLaunch).toHaveBeenCalledWith({
      runtimeId: 'claude',
      displayName: 'Fix checkout',
      nonInteractive: false,
    }))
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('stays closed without a workspace to start in', () => {
    render(<NewAgentModal {...baseProps} workspace={null} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
