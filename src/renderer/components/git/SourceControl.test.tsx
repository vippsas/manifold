import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SourceControl } from './SourceControl'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'

const mockInvoke = vi.fn()
const listeners = new Map<string, (...args: unknown[]) => void>()

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      listeners.set(channel, callback)
      return vi.fn()
    }),
  }
})

const workspace: Workspace = {
  id: 'ws-1',
  name: 'feature-x',
  projectIds: ['p1', 'p2'],
  createdAt: '2024-01-01',
  branchName: 'manifold/feature-x',
  worktreePaths: { p1: '/worktrees/repo-one', p2: '/worktrees/repo-two' },
}

const statuses: WorkspaceRepoStatus[] = [
  {
    projectId: 'p1',
    projectName: 'repo-one',
    checkoutPath: '/worktrees/repo-one',
    branch: 'manifold/feature-x',
    changes: [
      { path: 'src/app.ts', type: 'modified' },
      { path: 'docs/new.md', type: 'added' },
    ],
  },
  {
    projectId: 'p2',
    projectName: 'repo-two',
    checkoutPath: '/worktrees/repo-two',
    branch: 'manifold/feature-x',
    changes: [],
  },
]

describe('SourceControl', () => {
  it('shows an empty state without a workspace', () => {
    render(<SourceControl workspace={null} onSelectFile={vi.fn()} />)
    expect(screen.getByText('No workspace selected')).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('lists one section per repo with branch, changes, and a clean-repo row', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('repo-one')).toBeInTheDocument()
    })
    expect(mockInvoke).toHaveBeenCalledWith('git:workspace-status', 'ws-1')

    // Both sections carry the workspace branch.
    expect(screen.getAllByText('manifold/feature-x')).toHaveLength(2)
    // repo-one's changes, sorted with the modified file first.
    expect(screen.getByText('app.ts')).toBeInTheDocument()
    expect(screen.getByText('new.md')).toBeInTheDocument()
    // repo-two is clean.
    expect(screen.getByText('repo-two')).toBeInTheDocument()
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('opens a changed file with its checkout context for the SCM diff', async () => {
    mockInvoke.mockResolvedValue(statuses)
    const onSelectFile = vi.fn()
    render(<SourceControl workspace={workspace} onSelectFile={onSelectFile} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('app.ts'))

    expect(onSelectFile).toHaveBeenCalledWith('/worktrees/repo-one/src/app.ts', {
      workspaceId: 'ws-1',
      projectId: 'p1',
      relPath: 'src/app.ts',
    })
  })

  it('collapses a repo section on header click', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /repo-one/ }))

    expect(screen.queryByText('app.ts')).not.toBeInTheDocument()
    // The other section is untouched.
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('commits a repo through its message input and refreshes', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    // Only the repo with changes offers a message box.
    expect(screen.getAllByPlaceholderText(/to commit on/)).toHaveLength(1)

    fireEvent.change(screen.getByPlaceholderText(/to commit on/), { target: { value: 'fix: polish checkout' } })
    const callsBefore = mockInvoke.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Commit/ }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'fix: polish checkout')
    })
    // A refresh followed the commit.
    await waitFor(() => {
      expect(mockInvoke.mock.calls.slice(callsBefore).map((c) => c[0])).toContain('git:workspace-status')
    })
  })

  it('shows the branch as a switcher button in each repo header', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('repo-one')).toBeInTheDocument()
    })
    const branchButtons = screen.getAllByRole('button', { name: /manifold\/feature-x/ })
    expect(branchButtons).toHaveLength(2)
    expect(branchButtons[0]).toHaveAttribute('aria-haspopup', 'listbox')
  })

  it('refreshes when the file watcher reports changes', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('repo-one')).toBeInTheDocument()
    })
    const callsBefore = mockInvoke.mock.calls.length

    listeners.get('files:changed')?.({ sessionId: 's1', changes: [] })

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
