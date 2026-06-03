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
