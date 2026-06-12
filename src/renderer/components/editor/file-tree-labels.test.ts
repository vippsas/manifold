import { describe, it, expect } from 'vitest'
import { buildRootLabels } from './file-tree-labels'

const projects = [
  { id: 'p-manifold', name: 'manifold' },
  { id: 'p-landing', name: 'manifold-landingpage' },
]

describe('buildRootLabels', () => {
  it('labels primary and additional workspace roots with their repo names', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/wt/manifold-manifold-ws-6',
      additionalRootPaths: ['/wt/manifold-landingpage-manifold-ws-6'],
      activeSession: {
        projectId: 'p-manifold',
        workspaceWorktreePaths: {
          'p-manifold': '/wt/manifold-manifold-ws-6',
          'p-landing': '/wt/manifold-landingpage-manifold-ws-6',
        },
      },
      projects,
    })

    expect(labels.get('/wt/manifold-manifold-ws-6')).toBe('manifold')
    expect(labels.get('/wt/manifold-landingpage-manifold-ws-6')).toBe('manifold-landingpage')
  })

  it('returns an empty map for a single-repo session (no additional roots)', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/wt/manifold-manifold-ws-6',
      additionalRootPaths: [],
      activeSession: { projectId: 'p-manifold', workspaceWorktreePaths: undefined },
      projects,
    })

    expect(labels.size).toBe(0)
  })

  it('omits roots it cannot resolve so the file tree falls back to the basename', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/wt/manifold-manifold-ws-6',
      additionalRootPaths: ['/some/manually-added-dir'],
      activeSession: {
        projectId: 'p-manifold',
        workspaceWorktreePaths: { 'p-manifold': '/wt/manifold-manifold-ws-6' },
      },
      projects,
    })

    expect(labels.get('/wt/manifold-manifold-ws-6')).toBe('manifold')
    expect(labels.has('/some/manually-added-dir')).toBe(false)
  })

  it('derives the repo name from a managed worktree path when the project record is gone', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/Users/me/.manifold/worktrees/manifold/manifold-workspace',
      additionalRootPaths: ['/Users/me/.manifold/worktrees/landingpage/manifold-workspace'],
      activeSession: {
        projectId: 'p-removed',
        workspaceWorktreePaths: {
          'p-removed': '/Users/me/.manifold/worktrees/manifold/manifold-workspace',
          'p-also-removed': '/Users/me/.manifold/worktrees/landingpage/manifold-workspace',
        },
      },
      projects: [],
    })

    expect(labels.get('/Users/me/.manifold/worktrees/manifold/manifold-workspace')).toBe('manifold')
    expect(labels.get('/Users/me/.manifold/worktrees/landingpage/manifold-workspace')).toBe('landingpage')
  })

  it('derives the primary repo name from the worktree path when there is no active session', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/Users/me/.manifold/worktrees/manifold/manifold-workspace',
      additionalRootPaths: ['/some/manually-added-dir'],
      activeSession: null,
      projects,
    })

    expect(labels.get('/Users/me/.manifold/worktrees/manifold/manifold-workspace')).toBe('manifold')
    expect(labels.has('/some/manually-added-dir')).toBe(false)
  })

  it('prefers the registered project name over the path-derived repo name', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/Users/me/.manifold/worktrees/manifold/manifold-ws',
      additionalRootPaths: ['/Users/me/.manifold/worktrees/landing-dir/manifold-ws'],
      activeSession: {
        projectId: 'p-manifold',
        workspaceWorktreePaths: {
          'p-manifold': '/Users/me/.manifold/worktrees/manifold/manifold-ws',
          'p-landing': '/Users/me/.manifold/worktrees/landing-dir/manifold-ws',
        },
      },
      projects,
    })

    expect(labels.get('/Users/me/.manifold/worktrees/landing-dir/manifold-ws')).toBe('manifold-landingpage')
  })

  it('omits the primary root when there is no active session', () => {
    const labels = buildRootLabels({
      primaryTreePath: '/wt/manifold-manifold-ws-6',
      additionalRootPaths: ['/wt/manifold-landingpage-manifold-ws-6'],
      activeSession: null,
      projects,
    })

    expect(labels.has('/wt/manifold-manifold-ws-6')).toBe(false)
  })
})
