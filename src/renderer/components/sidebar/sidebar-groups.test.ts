import { describe, it, expect } from 'vitest'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { filterGroups, groupWorkspaces, liveWorkspaceIds, type GroupContext } from './sidebar-groups'

const projects: Project[] = [
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2024-01-02' },
]

const home = (id: string, name: string, projectIds: string[]): Workspace =>
  ({ id, name, projectIds, createdAt: '2024-01-01' })
const wt = (id: string, name: string, projectIds: string[], branchName = `${name}-branch`): Workspace =>
  ({ id, name, projectIds, createdAt: '2024-01-01', branchName, worktreePaths: Object.fromEntries(projectIds.map((p) => [p, `/wt/${id}/${p}`])) })

const ctx = (over: Partial<GroupContext> = {}): GroupContext =>
  ({ mode: 'recency', recency: {}, activeId: null, mergedIds: new Set(), liveIds: new Set(), ...over })

const ids = (ws: Workspace[]) => ws.map((w) => w.id)

describe('groupWorkspaces — shape', () => {
  it('buckets by primary repo: home first, worktrees after, keyed by the home card', () => {
    const groups = groupWorkspaces([wt('w-moss', 'moss', ['p-kong']), home('w-kong', 'kong', ['p-kong'])], projects, ctx())
    expect(groups).toHaveLength(1)
    expect(groups[0].repoName).toBe('kong')
    expect(groups[0].home?.id).toBe('w-kong')
    expect(ids(groups[0].worktrees)).toEqual(['w-moss'])
    // The group's fold belongs to the repo header, never to the home card —
    // the header is what folds the family, and the card folds its own files.
    expect(groups[0].foldKey).toBe('repo:p-kong')
  })

  it('heads a home-less repo with a repo key', () => {
    const [g] = groupWorkspaces([wt('w-moss', 'moss', ['p-kong'])], projects, ctx())
    expect(g.home).toBeNull()
    expect(g.foldKey).toBe('repo:p-kong')
    expect(g.repoName).toBe('kong')
  })

  // A multi-repo workspace appears once, under its primary (#939).
  it('anchors a multi-repo workspace under projectIds[0] only', () => {
    const groups = groupWorkspaces(
      [home('w-kong', 'kong', ['p-kong']), home('w-apex', 'apex', ['p-apex']), wt('w-x', 'cross', ['p-kong', 'p-apex'])],
      projects, ctx({ mode: 'alpha' }),
    )
    expect(groups.map((g) => g.repoName)).toEqual(['apex', 'kong'])
    expect(ids(groups[1].worktrees)).toEqual(['w-x'])
    expect(groups[0].worktrees).toEqual([])
  })

  it('gives a workspace with an unknown primary its own group, named after itself', () => {
    const [g] = groupWorkspaces([home('w-ghost', 'ghost', ['p-none'])], projects, ctx())
    expect(g.repoName).toBe('ghost')
    expect(g.home?.id).toBe('w-ghost')
    // Namespaced so closing a lone group can't also toggle its one member's
    // card, which shares the workspace id.
    expect(g.foldKey).toBe('repo:lone:w-ghost')
  })

  it('folds merged worktrees unless one is live', () => {
    const [g] = groupWorkspaces(
      [home('w-kong', 'kong', ['p-kong']), wt('w-a', 'a', ['p-kong']), wt('w-b', 'b', ['p-kong']), wt('w-c', 'c', ['p-kong'])],
      projects, ctx({ mergedIds: new Set(['w-b', 'w-c']), liveIds: new Set(['w-c']) }),
    )
    expect(ids(g.worktrees)).toEqual(['w-a', 'w-c'])
    expect(ids(g.merged)).toEqual(['w-b'])
  })
})

describe('groupWorkspaces — order', () => {
  const list = [
    home('w-apex', 'apex', ['p-apex']),
    home('w-kong', 'kong', ['p-kong']),
    wt('w-moss', 'moss', ['p-kong']),
    wt('w-dune', 'dune', ['p-kong']),
  ]

  it('recency: the active workspace’s whole group comes first', () => {
    const groups = groupWorkspaces(list, projects, ctx({ recency: { 'w-apex': 500 }, activeId: 'w-moss' }))
    expect(groups.map((g) => g.repoName)).toEqual(['kong', 'apex'])
  })

  it('recency: a group is as recent as its most recent member', () => {
    const groups = groupWorkspaces(list, projects, ctx({ recency: { 'w-apex': 100, 'w-dune': 900 } }))
    expect(groups.map((g) => g.repoName)).toEqual(['kong', 'apex'])
    expect(ids(groups[0].worktrees)).toEqual(['w-dune', 'w-moss'])
  })

  it('alpha: groups by repo name, members A–Z, no pin', () => {
    const groups = groupWorkspaces(list, projects, ctx({ mode: 'alpha', activeId: 'w-moss', recency: { 'w-moss': 900 } }))
    expect(groups.map((g) => g.repoName)).toEqual(['apex', 'kong'])
    expect(ids(groups[1].worktrees)).toEqual(['w-dune', 'w-moss'])
  })
})

describe('liveWorkspaceIds', () => {
  const s = (id: string, status: AgentSession['status']): AgentSession =>
    ({ id, projectId: 'p', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status, pid: 1, additionalDirs: [] })

  it('lists workspaces with a running or waiting agent', () => {
    expect(liveWorkspaceIds({ a: [s('1', 'done')], b: [s('2', 'waiting')], c: [s('3', 'running'), s('4', 'done')] }))
      .toEqual(new Set(['b', 'c']))
  })

})

describe('filterGroups', () => {
  const groups = groupWorkspaces(
    [home('w-kong', 'kong', ['p-kong']), wt('w-moss', 'moss', ['p-kong'], 'kong/moss-x'), wt('w-dune', 'dune', ['p-kong']), wt('w-old', 'old', ['p-kong']), home('w-apex', 'apex', ['p-apex'])],
    projects, ctx({ mode: 'alpha', mergedIds: new Set(['w-old']) }),
  )

  it('returns the groups untouched for a blank query', () => {
    expect(filterGroups(groups, '  ')).toEqual(groups)
  })

  it('keeps only matching members, drops empty groups, and bypasses the merged fold', () => {
    const out = filterGroups(groups, 'OLD')
    expect(out).toHaveLength(1)
    expect(out[0].repoName).toBe('kong')
    expect(out[0].home).toBeNull()
    expect(ids(out[0].worktrees)).toEqual(['w-old'])
    expect(out[0].merged).toEqual([])
  })

  it('matches on branch name too', () => {
    const out = filterGroups(groups, 'moss-x')
    expect(ids(out[0].worktrees)).toEqual(['w-moss'])
  })

  it('a repo-name hit keeps every member', () => {
    const out = filterGroups(groups, 'kong')
    expect(out).toHaveLength(1)
    expect(out[0].home?.id).toBe('w-kong')
    expect(ids(out[0].worktrees)).toEqual(['w-dune', 'w-moss', 'w-old'])
  })
})
