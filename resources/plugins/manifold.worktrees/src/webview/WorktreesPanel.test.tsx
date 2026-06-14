import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'
import { WorktreesPanel } from './WorktreesPanel'

const wt = (p: Partial<WorktreeOverviewEntry>): WorktreeOverviewEntry => ({
  worktreePath: p.worktreePath ?? p.branch ?? 'x', projectId: 'p', projectName: 'repo', branch: 'repo/b',
  status: 'idle', sessionId: null, ahead: 0, behind: 0, dirty: false, lastCommitISO: null, locked: false, ...p,
})
const br = (p: Partial<BranchOverviewEntry>): BranchOverviewEntry => ({
  projectId: 'p', projectName: 'repo', branch: 'repo/b', lastCommitISO: null, ...p,
})
const init = (entries: WorktreeOverviewEntry[], branches: BranchOverviewEntry[], focusRepo: string | null = null): void => {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', entries, branches, focusRepo, error: null } })) })
}

describe('WorktreesPanel (board)', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })
  afterEach(() => cleanup())

  it('shows a loading state until init arrives', () => {
    render(<WorktreesPanel />)
    expect(screen.getByText('Loading worktrees…')).toBeTruthy()
  })

  it('renders active and idle worktrees in their columns', () => {
    render(<WorktreesPanel />)
    init([
      wt({ worktreePath: '1', branch: 'repo/live', status: 'active', behind: 3 }),
      wt({ worktreePath: '2', branch: 'repo/old', status: 'idle', dirty: true }),
    ], [])
    expect(screen.getByTitle('repo/live')).toBeTruthy()
    expect(screen.getByTitle('repo/old')).toBeTruthy()
    expect(screen.getByText('● uncommitted')).toBeTruthy()
    expect(screen.getAllByTestId('worktree-card').length).toBe(2)
  })

  it('shows the empty state when nothing is managed', () => {
    render(<WorktreesPanel />)
    init([], [])
    expect(screen.getByText('No managed worktrees.')).toBeTruthy()
  })

  it('expands a prune row and deletes a single branch (posts deleteBranch + optimistic remove)', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<WorktreesPanel />)
    init([], [br({ projectId: 'pid', projectName: 'repo', branch: 'repo/gone' })])
    expect(screen.queryByTestId('orphan-branch')).toBeNull() // collapsed by default
    fireEvent.click(screen.getByTestId('orphan-branches-header'))
    fireEvent.click(screen.getByTestId('delete-branch'))
    expect(post).toHaveBeenCalledWith({ type: 'deleteBranch', projectId: 'pid', branch: 'repo/gone' }, '*')
    expect(screen.queryByTestId('orphan-branch')).toBeNull()
    post.mockRestore()
  })

  it('posts deleteAllBranches without toggling the row open', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<WorktreesPanel />)
    init([], [
      br({ projectId: 'pid', projectName: 'repo', branch: 'repo/a' }),
      br({ projectId: 'pid', projectName: 'repo', branch: 'repo/b' }),
    ])
    fireEvent.click(screen.getByTestId('delete-all-branches'))
    expect(post).toHaveBeenCalledWith({ type: 'deleteAllBranches', projectId: 'pid', repo: 'repo', count: 2 }, '*')
    expect(screen.queryByTestId('orphan-branch')).toBeNull() // stopPropagation kept it collapsed
    post.mockRestore()
  })

  it('default-expands the repo the user came from', () => {
    render(<WorktreesPanel />)
    init([], [br({ projectName: 'repo', branch: 'repo/x' })], 'repo')
    expect(screen.getByTestId('orphan-branch')).toBeTruthy()
  })
})
