import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { workspaceGlyphKind } from '../../../shared/workspace-types'

const base = { id: 'w', name: 'w', createdAt: '' }

describe('workspaceGlyphKind', () => {
  it("is home for the repo's own clone", () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1'] })).toBe('home')
  })

  it('is worktree when the workspace owns its checkout', () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1'], worktreePaths: { p1: '/wt' } })).toBe('worktree')
  })

  // A cross-repo task reads as one whether or not it owns its checkouts.
  it('is multi for several repos, checkout or not', () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1', 'p2'] })).toBe('multi')
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1', 'p2'], worktreePaths: { p1: '/a', p2: '/b' } })).toBe('multi')
  })
})

describe('WorkspaceGlyph', () => {
  it('marks the svg with its kind', () => {
    for (const kind of ['home', 'worktree', 'multi'] as const) {
      const { container, unmount } = render(<WorkspaceGlyph kind={kind} />)
      expect(container.querySelector('svg')?.getAttribute('data-glyph')).toBe(kind)
      unmount()
    }
  })
})
