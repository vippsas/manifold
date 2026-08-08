import { describe, it, expect } from 'vitest'
import { normalizeFavorites } from './normalize-favorites'
import type { Workspace } from '../../../shared/workspace-types'

// p1 lives in a home workspace and in a feature worktree; p2 only in a worktree
// workspace; p3 in none.
const workspaces: Workspace[] = [
  { id: 'home1', name: 'manifold', projectIds: ['p1'], createdAt: '' },
  {
    id: 'wt1',
    name: 'manifold/feature',
    projectIds: ['p1'],
    createdAt: '',
    branchName: 'feature',
    worktreePaths: { p1: '/wt/feature' },
  },
  {
    id: 'wt2',
    name: 'billing/fix',
    projectIds: ['p2'],
    createdAt: '',
    branchName: 'fix',
    worktreePaths: { p2: '/wt/fix' },
  },
]

describe('normalizeFavorites', () => {
  it('passes through ids already in the current shape', () => {
    expect(normalizeFavorites(['home1', 'wt2'], workspaces)).toEqual(['home1', 'wt2'])
  })

  it('unwraps a legacy workspace ref to its id', () => {
    expect(normalizeFavorites([{ kind: 'workspace', id: 'wt1' }], workspaces)).toEqual(['wt1'])
  })

  it('remaps a legacy repo ref to the home workspace that spans it', () => {
    // Not wt1 — a repo favorite meant the repository, so it lands on the clone.
    expect(normalizeFavorites([{ kind: 'repo', id: 'p1' }], workspaces)).toEqual(['home1'])
  })

  it('falls back to any spanning workspace when the repo has no home one', () => {
    expect(normalizeFavorites([{ kind: 'repo', id: 'p2' }], workspaces)).toEqual(['wt2'])
  })

  it('drops a repo ref no workspace spans', () => {
    expect(normalizeFavorites([{ kind: 'repo', id: 'p3' }], workspaces)).toEqual([])
  })

  it('preserves the user order across mixed shapes', () => {
    const stored = [{ kind: 'repo' as const, id: 'p2' }, 'home1', { kind: 'workspace' as const, id: 'wt1' }]
    expect(normalizeFavorites(stored, workspaces)).toEqual(['wt2', 'home1', 'wt1'])
  })

  it('collapses duplicates so one row never takes two ⌘ slots', () => {
    // Both refs resolve to home1: the repo favorite and the workspace itself.
    const stored = [{ kind: 'repo' as const, id: 'p1' }, { kind: 'workspace' as const, id: 'home1' }]
    expect(normalizeFavorites(stored, workspaces)).toEqual(['home1'])
  })

  it('returns nothing for nothing stored', () => {
    expect(normalizeFavorites([], workspaces)).toEqual([])
  })
})
