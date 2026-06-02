import { describe, expect, it } from 'vitest'
import { filterStandaloneProjectSessions } from './session-selection'

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
})
