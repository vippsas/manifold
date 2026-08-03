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

  it('opens a changed file by its absolute path in the workspace checkout', async () => {
    mockInvoke.mockResolvedValue(statuses)
    const onSelectFile = vi.fn()
    render(<SourceControl workspace={workspace} onSelectFile={onSelectFile} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('app.ts'))

    expect(onSelectFile).toHaveBeenCalledWith('/worktrees/repo-one/src/app.ts')
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
