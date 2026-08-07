import { describe, it, expect } from 'vitest'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { workspaceRowLabel } from './agent-labels'

function project(name: string, id = name): Project {
  return { id, name, path: `/repos/${name}`, baseBranch: 'main', addedAt: '2026-08-07T00:00:00.000Z' }
}

function workspace(name: string, projectIds: string[], worktree = true): Workspace {
  return {
    id: `ws-${name}`,
    name,
    projectIds,
    createdAt: '2026-08-07T00:00:00.000Z',
    ...(worktree ? { branchName: name, worktreePaths: Object.fromEntries(projectIds.map((id) => [id, `/wt/${id}`])) } : {}),
  }
}

const PROJECTS = [project('kong'), project('manifold'), project('platform-ai'), project('vops')]

describe('workspaceRowLabel', () => {
  it('drops the repo when the name already is the repo (home workspace)', () => {
    expect(workspaceRowLabel(workspace('vops', ['vops'], false), PROJECTS))
      .toEqual({ repo: null, name: 'vops' })
  })

  it('strips a redundant branch prefix off the name', () => {
    expect(workspaceRowLabel(workspace('kong/moss', ['kong']), PROJECTS))
      .toEqual({ repo: 'kong', name: 'moss' })
  })

  it('labels a name that never carried a prefix', () => {
    expect(workspaceRowLabel(workspace('jessheim-4', ['manifold']), PROJECTS))
      .toEqual({ repo: 'manifold', name: 'jessheim-4' })
  })

  it('counts the extra repos of a multi-repo workspace', () => {
    expect(workspaceRowLabel(workspace('sandnes', ['platform-ai', 'kong', 'manifold']), PROJECTS))
      .toEqual({ repo: 'platform-ai +2', name: 'sandnes' })
  })

  it('labels a renamed home workspace, since the name no longer says the repo', () => {
    expect(workspaceRowLabel(workspace('main dev', ['kong'], false), PROJECTS))
      .toEqual({ repo: 'kong', name: 'main dev' })
  })

  it('matches the repo prefix case-insensitively', () => {
    expect(workspaceRowLabel(workspace('Kong/Moss', ['kong']), PROJECTS))
      .toEqual({ repo: 'kong', name: 'Moss' })
  })

  it('invents no label when the primary repo is not registered', () => {
    expect(workspaceRowLabel(workspace('ghost/oslo', ['ghost']), PROJECTS))
      .toEqual({ repo: null, name: 'ghost/oslo' })
  })

  it('invents no label for a workspace with no repos', () => {
    expect(workspaceRowLabel(workspace('empty', []), PROJECTS))
      .toEqual({ repo: null, name: 'empty' })
  })
})
