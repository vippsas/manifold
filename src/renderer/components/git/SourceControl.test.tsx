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
    staged: [{ path: 'src/staged.ts', type: 'modified' }],
    unstaged: [{ path: 'src/app.ts', type: 'modified' }],
    untracked: [{ path: 'docs/new.md', type: 'added' }],
  },
  {
    projectId: 'p2',
    projectName: 'repo-two',
    checkoutPath: '/worktrees/repo-two',
    branch: 'manifold/feature-x',
    staged: [],
    unstaged: [],
    untracked: [],
  },
]

/** Nothing in the index — the shape that makes Commit ask before staging all. */
const unstagedOnly: WorkspaceRepoStatus[] = [
  { ...statuses[0], staged: [] },
  statuses[1],
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
    expect(screen.getByText('app.ts')).toBeInTheDocument()
    expect(screen.getByText('new.md')).toBeInTheDocument()
    // repo-two is clean.
    expect(screen.getByText('repo-two')).toBeInTheDocument()
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('splits changes into staged, unstaged, and untracked groups with counts', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Staged Changes')).toBeInTheDocument()
    })
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('Untracked Changes')).toBeInTheDocument()
    expect(screen.getByText('staged.ts')).toBeInTheDocument()
    // The repo badge counts all three groups.
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('opens a changed file with its checkout context and which half was clicked', async () => {
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
      staged: false,
    })

    fireEvent.click(screen.getByText('staged.ts'))
    expect(onSelectFile).toHaveBeenCalledWith('/worktrees/repo-one/src/staged.ts', {
      workspaceId: 'ws-1',
      projectId: 'p1',
      relPath: 'src/staged.ts',
      staged: true,
    })
  })

  it('stages one file from its row action', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    // Row actions appear on hover, the way VS Code keeps a long list quiet.
    fireEvent.mouseEnter(screen.getByTitle('src/app.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Stage src/app.ts' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-stage', 'ws-1', 'p1', ['src/app.ts'])
    })
  })

  it('unstages a staged file from its row action', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('staged.ts')).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByTitle('src/staged.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Unstage src/staged.ts' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-unstage', 'ws-1', 'p1', ['src/staged.ts'])
    })
  })

  it('stages a whole group from the group action', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Changes')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stage all Changes' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-stage', 'ws-1', 'p1', ['src/app.ts'])
    })
  })

  it('confirms before discarding and only then throws the change away', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByTitle('src/app.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard src/app.ts' }))

    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:workspace-discard', 'ws-1', 'p1', ['src/app.ts'])

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-discard', 'ws-1', 'p1', ['src/app.ts'])
    })
  })

  it('discards nothing when the confirm is cancelled', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByTitle('src/app.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard src/app.ts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:workspace-discard', 'ws-1', 'p1', ['src/app.ts'])
  })

  it('commits only the index when something is staged', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    // Every repo section offers a message box, clean or not, so it never moves
    // out from under a half-typed message when the last change is staged.
    expect(screen.getAllByPlaceholderText(/to commit on/)).toHaveLength(2)

    fireEvent.change(screen.getAllByPlaceholderText(/to commit on/)[0], { target: { value: 'fix: polish checkout' } })
    const callsBefore = mockInvoke.mock.calls.length
    fireEvent.click(screen.getAllByRole('button', { name: /^Commit$/ })[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'fix: polish checkout', false)
    })
    // A refresh followed the commit.
    await waitFor(() => {
      expect(mockInvoke.mock.calls.slice(callsBefore).map((c) => c[0])).toContain('git:workspace-status')
    })
  })

  it('asks before committing when nothing is staged, then stages all', async () => {
    mockInvoke.mockResolvedValue(unstagedOnly)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.change(screen.getAllByPlaceholderText(/to commit on/)[0], { target: { value: 'wip' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^Commit$/ })[0])

    expect(screen.getByText('No staged changes')).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'wip', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Stage all & commit' }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'wip', true)
    })
  })

  it('commits nothing when the stage-all prompt is cancelled', async () => {
    mockInvoke.mockResolvedValue(unstagedOnly)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.change(screen.getAllByPlaceholderText(/to commit on/)[0], { target: { value: 'wip' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^Commit$/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('No staged changes')).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'wip', expect.anything())
  })

  it('commits from the repo header check as well as the button', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.change(screen.getAllByPlaceholderText(/to commit on/)[0], { target: { value: 'from the header' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit repo-one' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-commit', 'ws-1', 'p1', 'from the header', false)
    })
  })

  it('refreshes from the repo header refresh action', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('repo-one')).toBeInTheDocument()
    })
    const callsBefore = mockInvoke.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Refresh repo-one' }))

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('collapses a repo section on header click', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'repo-one' }))

    expect(screen.queryByText('app.ts')).not.toBeInTheDocument()
    // The other section is untouched.
    expect(screen.getByText('No changes')).toBeInTheDocument()
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


  it('warns that discarding an untracked file deletes it rather than reverts it', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('new.md')).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByTitle('docs/new.md'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard docs/new.md' }))

    // Untracked files have no committed version to fall back to.
    expect(screen.getByText('Delete untracked files?')).toBeInTheDocument()
    expect(screen.getByText(/will be deleted from disk/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-discard', 'ws-1', 'p1', ['docs/new.md'])
    })
  })

  it('stages a file from its right-click menu', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('src/app.ts'))
    fireEvent.click(screen.getByText('Stage Changes'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-stage', 'ws-1', 'p1', ['src/app.ts'])
    })
  })

  it('offers unstage rather than discard on a staged row menu', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('staged.ts')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('src/staged.ts'))

    expect(screen.queryByText('Discard Changes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Unstage Changes'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-unstage', 'ws-1', 'p1', ['src/staged.ts'])
    })
  })

  it('discards a whole group from the group header menu, after confirming', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Changes')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByText('Changes'))
    fireEvent.click(screen.getByText('Discard All Changes'))

    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-discard', 'ws-1', 'p1', ['src/app.ts'])
    })
  })

  it('switches to a tree of directories and back to a flat list', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    // Only the tree gives a directory its own row, so the label is what tells
    // the two modes apart.
    expect(screen.queryByLabelText('src')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View as Tree' }))
    expect(screen.getAllByLabelText('src').length).toBeGreaterThan(0)
    expect(screen.getByText('app.ts')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View as List' }))
    expect(screen.queryByLabelText('src')).not.toBeInTheDocument()
  })

  it('collapses a directory in tree view, hiding the files under it', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'View as Tree' }))

    // Staged Changes renders before Changes, so the second 'src' row is the
    // unstaged group's.
    const [, unstagedDir] = screen.getAllByLabelText('src')
    fireEvent.click(unstagedDir)

    expect(screen.queryByText('app.ts')).not.toBeInTheDocument()
    // The staged group is untouched.
    expect(screen.getByText('staged.ts')).toBeInTheDocument()
  })

  it('stages every file under a directory from its tree row', async () => {
    mockInvoke.mockResolvedValue(statuses)
    render(<SourceControl workspace={workspace} onSelectFile={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'View as Tree' }))

    const [, unstagedDir] = screen.getAllByLabelText('src')
    fireEvent.mouseEnter(unstagedDir)
    fireEvent.click(screen.getByRole('button', { name: 'Stage src' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:workspace-stage', 'ws-1', 'p1', ['src/app.ts'])
    })
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
