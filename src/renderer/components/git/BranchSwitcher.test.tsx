import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BranchSwitcher } from './BranchSwitcher'
import type { BranchInfo } from '../../../shared/types'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

const branches: BranchInfo[] = [
  { name: 'main', source: 'both' },
  { name: 'feature/login', source: 'local' },
  { name: 'feature/signup', source: 'remote' },
]

function renderSwitcher(onCheckedOut = vi.fn()): { onCheckedOut: ReturnType<typeof vi.fn> } {
  render(
    <BranchSwitcher
      workspaceId="ws-1"
      projectId="p1"
      repoName="storefront"
      currentBranch="main"
      onCheckedOut={onCheckedOut}
      defaultOpen
    />,
  )
  return { onCheckedOut }
}

describe('BranchSwitcher', () => {
  it('lists the repo branches from git:list-branches in a modal naming the repo', async () => {
    mockInvoke.mockResolvedValue(branches)
    renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    expect(mockInvoke).toHaveBeenCalledWith('git:list-branches', 'p1')
    // A centered modal, not a popover cramped into the panel column.
    expect(screen.getByRole('dialog', { name: 'Switch branch' })).toBeInTheDocument()
    expect(screen.getByText(/storefront/)).toBeInTheDocument()
    // Remote-only branches carry their source badge.
    expect(screen.getByText('remote')).toBeInTheDocument()
    // The checked-out branch is marked and inert.
    expect(screen.getByRole('option', { name: /main/ })).toHaveAttribute('aria-current', 'true')
  })

  it('moves the active row with the arrow keys and checks out on Enter', async () => {
    mockInvoke.mockResolvedValue(branches)
    renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    mockInvoke.mockResolvedValue(undefined)
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-checkout', 'ws-1', 'p1', 'feature/login', false)
    })
  })

  it('closes on Escape without checking anything out', async () => {
    mockInvoke.mockResolvedValue(branches)
    const { onCheckedOut } = renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onCheckedOut).not.toHaveBeenCalled()
  })

  it('checks out an existing branch and reports back', async () => {
    mockInvoke.mockResolvedValue(branches)
    const { onCheckedOut } = renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    mockInvoke.mockResolvedValue(undefined)
    fireEvent.click(screen.getByText('feature/login'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-checkout', 'ws-1', 'p1', 'feature/login', false)
    })
    expect(onCheckedOut).toHaveBeenCalled()
  })

  it('offers to create a branch when the typed name matches nothing', async () => {
    mockInvoke.mockResolvedValue(branches)
    const { onCheckedOut } = renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'feature/brand-new' } })
    mockInvoke.mockResolvedValue(undefined)
    fireEvent.click(screen.getByText(/Create new branch/))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-checkout', 'ws-1', 'p1', 'feature/brand-new', true)
    })
    expect(onCheckedOut).toHaveBeenCalled()
  })

  it('does not offer creating a branch that already exists', async () => {
    mockInvoke.mockResolvedValue(branches)
    renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'feature/login' } })

    expect(screen.queryByText(/Create new branch/)).not.toBeInTheDocument()
  })

  it('surfaces a failed checkout instead of closing', async () => {
    mockInvoke.mockResolvedValue(branches)
    const { onCheckedOut } = renderSwitcher()

    await waitFor(() => {
      expect(screen.getByText('feature/login')).toBeInTheDocument()
    })
    mockInvoke.mockRejectedValue(new Error('local changes would be overwritten'))
    fireEvent.click(screen.getByText('feature/login'))

    await waitFor(() => {
      expect(screen.getByText(/local changes would be overwritten/)).toBeInTheDocument()
    })
    expect(onCheckedOut).not.toHaveBeenCalled()
    // The modal stays open for another attempt.
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})
