import { describe, expect, it } from 'vitest'
import { filterStandaloneProjectSessions, filterActiveStandaloneProjectSessions } from './session-selection'

describe('filterStandaloneProjectSessions', () => {
  it('returns all project sessions', () => {
    expect(filterStandaloneProjectSessions([
      { id: 'standalone-1', worktreePath: '/wt-1' },
      { id: 'standalone-2', worktreePath: '/wt-2' },
    ])).toEqual([
      { id: 'standalone-1', worktreePath: '/wt-1' },
      { id: 'standalone-2', worktreePath: '/wt-2' },
    ])
  })

  it('returns an empty array for an empty input', () => {
    expect(filterStandaloneProjectSessions([])).toEqual([])
  })

  it('excludes workspace agents (they belong to the workspace UI, not the project list)', () => {
    expect(filterStandaloneProjectSessions([
      { id: 'standalone', worktreePath: '/wt-1' },
      { id: 'workspace-agent', worktreePath: '/wt-2', workspaceId: 'w1' },
    ])).toEqual([
      { id: 'standalone', worktreePath: '/wt-1' },
    ])
  })
})

describe('filterActiveStandaloneProjectSessions', () => {
  it('keeps running and waiting agents', () => {
    expect(filterActiveStandaloneProjectSessions([
      { id: 'running', worktreePath: '/wt-1', status: 'running' },
      { id: 'waiting', worktreePath: '/wt-2', status: 'waiting' },
    ])).toEqual([
      { id: 'running', worktreePath: '/wt-1', status: 'running' },
      { id: 'waiting', worktreePath: '/wt-2', status: 'waiting' },
    ])
  })

  it('drops terminal (done/error) agents so a finished repo is no longer "with agents"', () => {
    expect(filterActiveStandaloneProjectSessions([
      { id: 'done', worktreePath: '/wt-1', status: 'done' },
      { id: 'error', worktreePath: '/wt-2', status: 'error' },
    ])).toEqual([])
  })

  it('also excludes workspace agents regardless of status', () => {
    expect(filterActiveStandaloneProjectSessions([
      { id: 'standalone-running', worktreePath: '/wt-1', status: 'running' },
      { id: 'workspace-running', worktreePath: '/wt-2', status: 'running', workspaceId: 'w1' },
    ])).toEqual([
      { id: 'standalone-running', worktreePath: '/wt-1', status: 'running' },
    ])
  })
})
