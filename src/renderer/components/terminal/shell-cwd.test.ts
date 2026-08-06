import { describe, expect, it } from 'vitest'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { resolveShellCwd } from './shell-cwd'

const projects: Project[] = [
  { id: 'p1', name: 'storefront', path: '/repos/storefront' },
  { id: 'p2', name: 'payments', path: '/repos/payments' },
] as unknown as Project[]

function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    name: 'checkout',
    projectIds: ['p1', 'p2'],
    createdAt: '2026-08-05',
    ...over,
  } as Workspace
}

describe('resolveShellCwd', () => {
  it('prefers the focused workspace primary checkout', () => {
    const ws = workspace({ worktreePaths: { p1: '/worktrees/checkout/storefront' } })
    expect(resolveShellCwd([ws], 'w1', 'p2', projects)).toBe('/worktrees/checkout/storefront')
  })

  it('falls back to the primary project path on a home workspace', () => {
    expect(resolveShellCwd([workspace()], 'w1', null, projects)).toBe('/repos/storefront')
  })

  it('finds the workspace holding the active project when none is focused', () => {
    expect(resolveShellCwd([workspace()], null, 'p2', projects)).toBe('/repos/storefront')
  })

  it('does not change when the active project changes within one workspace', () => {
    const ws = workspace()
    expect(resolveShellCwd([ws], 'w1', 'p1', projects))
      .toBe(resolveShellCwd([ws], 'w1', 'p2', projects))
  })

  it('returns null when no workspace resolves', () => {
    expect(resolveShellCwd([], null, null, projects)).toBeNull()
  })

  it('returns null when the primary project is unknown', () => {
    expect(resolveShellCwd([workspace({ projectIds: ['ghost'] })], 'w1', null, projects)).toBeNull()
  })
})
