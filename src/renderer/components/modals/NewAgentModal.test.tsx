import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewAgentModal } from './NewAgentModal'
import type { Project } from '../../../shared/types'

const project: Project = {
  id: 'p1',
  name: 'Storefront',
  path: '/repos/storefront',
  baseBranch: 'main',
  addedAt: '2026-07-13',
  kind: 'git',
}

const baseProps = {
  visible: true,
  project,
  existingSessions: [],
  defaultRuntime: 'claude',
  defaultAgentMode: 'interactive' as const,
  defaultUseWorktrees: true,
  onLaunch: vi.fn(async () => ({ id: 'session-1' })),
  onResumeSession: vi.fn(async () => undefined),
  onDeleteSession: vi.fn(),
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
  it('launches from a dialog and closes after a successful start', async () => {
    render(<NewAgentModal {...baseProps} />)

    expect(screen.getByRole('dialog', { name: 'New agent in Storefront' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Agent name/), { target: { value: 'Fix checkout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Agent' }))

    await waitFor(() => expect(baseProps.onLaunch).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1',
      runtimeId: 'claude',
      prompt: 'Fix checkout',
    })))
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('names the workspace and repository in the workspace dialog', () => {
    render(<NewAgentModal
      {...baseProps}
      workspace={{ id: 'w1', name: 'Checkout', projectIds: ['p1'], createdAt: '2026-07-13' }}
    />)

    expect(screen.getByRole('dialog', { name: 'New agent in Checkout · Storefront' })).toBeInTheDocument()
    expect(screen.getByText('Checkout · Storefront')).toBeInTheDocument()
  })
})
