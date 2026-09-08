import { describe, it, expect } from 'vitest'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { nextAgentName, workspaceRowLabel, rowStatus, isLive } from './agent-labels'

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
      .toEqual({ repo: null, name: 'vops', extra: null })
  })

  it('strips a redundant branch prefix off the name', () => {
    expect(workspaceRowLabel(workspace('kong/moss', ['kong']), PROJECTS))
      .toEqual({ repo: 'kong', name: 'moss', extra: null })
  })

  it('labels a name that never carried a prefix', () => {
    expect(workspaceRowLabel(workspace('jessheim-4', ['manifold']), PROJECTS))
      .toEqual({ repo: 'manifold', name: 'jessheim-4', extra: null })
  })

  it('names the one extra repo of a two-repo workspace, and counts more', () => {
    expect(workspaceRowLabel(workspace('sandnes', ['platform-ai', 'kong']), PROJECTS))
      .toEqual({ repo: 'platform-ai', name: 'sandnes', extra: '+1 kong' })
    expect(workspaceRowLabel(workspace('sandnes', ['platform-ai', 'kong', 'manifold']), PROJECTS))
      .toEqual({ repo: 'platform-ai', name: 'sandnes', extra: '+2' })
  })

  // A multi-repo *home* workspace named after its primary: the repo is still
  // redundant with the name, only the extra survives.
  it('drops the repo but keeps the extra on a multi-repo home workspace', () => {
    expect(workspaceRowLabel(workspace('kong', ['kong', 'manifold'], false), PROJECTS))
      .toEqual({ repo: null, name: 'kong', extra: '+1 manifold' })
  })

  it('labels a renamed home workspace, since the name no longer says the repo', () => {
    expect(workspaceRowLabel(workspace('main dev', ['kong'], false), PROJECTS))
      .toEqual({ repo: 'kong', name: 'main dev', extra: null })
  })

  it('matches the repo prefix case-insensitively', () => {
    expect(workspaceRowLabel(workspace('Kong/Moss', ['kong']), PROJECTS))
      .toEqual({ repo: 'kong', name: 'Moss', extra: null })
  })

  it('invents no label when the primary repo is not registered', () => {
    expect(workspaceRowLabel(workspace('ghost/oslo', ['ghost']), PROJECTS))
      .toEqual({ repo: null, name: 'ghost/oslo', extra: null })
  })

  it('invents no label for a workspace with no repos', () => {
    expect(workspaceRowLabel(workspace('empty', []), PROJECTS))
      .toEqual({ repo: null, name: 'empty', extra: null })
  })
})

describe('nextAgentName', () => {
  const named = (...names: (string | undefined)[]): { displayName?: string }[] =>
    names.map((displayName) => ({ displayName }))

  it('names the first agent after its runtime, unnumbered', () => {
    expect(nextAgentName('claude', [])).toBe('Claude')
  })

  it('names orchestration agents Viola', () => {
    expect(nextAgentName('viola', [])).toBe('Viola')
    expect(nextAgentName('viola', named('Viola'))).toBe('Viola 2')
  })

  it('numbers the second', () => {
    expect(nextAgentName('claude', named('Claude'))).toBe('Claude 2')
  })

  // The bug it replaced: a count of same-runtime agents reads 2 here, and would
  // hand "Claude 3" to an agent while the original "Claude 3" is still open.
  it('takes the free slot left by a deleted middle agent', () => {
    expect(nextAgentName('claude', named('Claude', 'Claude 3'))).toBe('Claude 2')
  })

  it('keeps climbing past a run of taken names', () => {
    expect(nextAgentName('claude', named('Claude', 'Claude 2', 'Claude 3'))).toBe('Claude 4')
  })

  // A count could not see this either: the agent still counted, but had let go
  // of the name it was counted for.
  it('reuses the name a renamed agent gave up', () => {
    expect(nextAgentName('claude', named('Shipping fix'))).toBe('Claude')
  })

  // Names, not runtimes, are what collide on a tab.
  it('avoids a name held by an agent of another runtime', () => {
    expect(nextAgentName('claude', named('Claude', 'Claude 2'))).toBe('Claude 3')
  })

  it('leaves an unnamed legacy agent holding nothing', () => {
    expect(nextAgentName('claude', named(undefined, '  '))).toBe('Claude')
  })

  it('falls back to the runtime id for an unknown runtime', () => {
    expect(nextAgentName('mystery', [])).toBe('mystery')
  })
})

describe('rowStatus', () => {
  const s = (...statuses: Array<'running' | 'waiting' | 'done' | 'error'>) => statuses.map((status) => ({ status }))

  it('is null when nothing is alive or failed', () => {
    expect(rowStatus([])).toBeNull()
    expect(rowStatus(s('done', 'done'))).toBeNull()
  })

  // An agent that needs you outranks one that is busy.
  it('prefers waiting over running over error', () => {
    expect(rowStatus(s('running', 'waiting'))).toBe('waiting')
    expect(rowStatus(s('running', 'error'))).toBe('running')
    expect(rowStatus(s('done', 'error'))).toBe('error')
  })

  it('isLive is true for running or waiting only', () => {
    expect(isLive(s('done', 'error'))).toBe(false)
    expect(isLive(s('done', 'waiting'))).toBe(true)
    expect(isLive(s('running'))).toBe(true)
  })
})
