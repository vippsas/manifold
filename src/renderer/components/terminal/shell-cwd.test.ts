import { describe, expect, it } from 'vitest'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { describeShellFolder, resolveShellCwd, resolveShellFolders } from './shell-cwd'

const projects: Project[] = [
  { id: 'p1', name: 'storefront', path: '/repos/storefront' },
  { id: 'p2', name: 'payments', path: '/repos/payments' },
  { id: 'p3', name: 'docs', path: '/repos/docs' },
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

describe('resolveShellFolders', () => {
  it('lists every member in projectIds order, each at its own checkout', () => {
    const ws = workspace({ worktreePaths: { p1: '/worktrees/checkout/storefront', p2: '/worktrees/checkout/payments' } })
    expect(resolveShellFolders([ws], 'w1', null, projects)).toEqual([
      { projectId: 'p1', name: 'storefront', path: '/worktrees/checkout/storefront' },
      { projectId: 'p2', name: 'payments', path: '/worktrees/checkout/payments' },
    ])
  })

  it('falls back to the clone for a member with no worktree', () => {
    const ws = workspace({ worktreePaths: { p1: '/worktrees/checkout/storefront' } })
    expect(resolveShellFolders([ws], 'w1', null, projects).map((f) => f.path))
      .toEqual(['/worktrees/checkout/storefront', '/repos/payments'])
  })

  it('skips a member the registry no longer knows', () => {
    const ws = workspace({ projectIds: ['p1', 'ghost'] })
    expect(resolveShellFolders([ws], 'w1', null, projects).map((f) => f.projectId)).toEqual(['p1'])
  })

  // VS Code shrinks its pick list the same way (terminalActions.ts:1710): two
  // rows resolving to one directory are one choice, not two.
  it('collapses members that resolve to the same directory, keeping the first', () => {
    const ws = workspace({
      projectIds: ['p1', 'p2', 'p3'],
      worktreePaths: { p2: '/repos/storefront' },
    })
    expect(resolveShellFolders([ws], 'w1', null, projects).map((f) => f.name))
      .toEqual(['storefront', 'docs'])
  })

  it('is empty when no workspace resolves', () => {
    expect(resolveShellFolders([], null, null, projects)).toEqual([])
  })

  it('agrees with resolveShellCwd on the primary folder', () => {
    const ws = workspace({ worktreePaths: { p1: '/worktrees/checkout/storefront' } })
    expect(resolveShellFolders([ws], 'w1', null, projects)[0].path)
      .toBe(resolveShellCwd([ws], 'w1', null, projects))
  })
})

describe('describeShellFolder', () => {
  const folder = (name: string, path: string) => ({ projectId: name, name, path })

  it('drops the prefix every offered folder shares', () => {
    const offered = [
      folder('cleanup', '/Users/you/.manifold/worktrees/cleanup/manifold-playground'),
      folder('infra', '/Users/you/.manifold/worktrees/infra/manifold-playground'),
      folder('docs', '/Users/you/projects/docs'),
    ]
    expect(offered.map((f) => describeShellFolder(f, offered))).toEqual([
      '.manifold/worktrees/cleanup/manifold-playground',
      '.manifold/worktrees/infra/manifold-playground',
      'projects/docs',
    ])
  })

  it('says nothing when the remainder is just the name again', () => {
    const offered = [folder('storefront', '/repos/storefront'), folder('payments', '/repos/payments')]
    expect(offered.map((f) => describeShellFolder(f, offered))).toEqual([undefined, undefined])
  })

  it('keeps the whole path when there is only one folder to describe', () => {
    const only = [folder('storefront', '/repos/storefront')]
    expect(describeShellFolder(only[0], only)).toBe('repos/storefront')
  })

  it('never eats a path whole when one folder nests inside another', () => {
    const offered = [folder('app', '/repos/app'), folder('api', '/repos/app/api')]
    expect(offered.map((f) => describeShellFolder(f, offered))).toEqual([undefined, 'app/api'])
  })
})
