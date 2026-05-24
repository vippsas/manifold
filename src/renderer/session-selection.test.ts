import { describe, expect, it } from 'vitest'
import {
  collectSuperagentIds,
  collectSuperagentChildSessionIds,
  collectSuperagentFleetProjectIds,
  collectSuperagentFleetWorktreePaths,
  filterStandaloneProjectSessions,
  shouldPreserveSuperagentSelection,
} from './session-selection'

describe('shouldPreserveSuperagentSelection', () => {
  it('returns true for flagged selections inside the active superagent fleet', () => {
    expect(shouldPreserveSuperagentSelection(
      { fleetProjectIds: ['p1', 'p2'] },
      'p2',
      { preserveSuperagent: true },
    )).toBe(true)
  })

  it('returns false when the click should follow normal project navigation', () => {
    expect(shouldPreserveSuperagentSelection(
      { fleetProjectIds: ['p1', 'p2'] },
      'p2',
    )).toBe(false)
    expect(shouldPreserveSuperagentSelection(
      { fleetProjectIds: ['p1', 'p2'] },
      'p3',
      { preserveSuperagent: true },
    )).toBe(false)
  })

  it('collects child session ids from all superagents', () => {
    expect(Array.from(collectSuperagentChildSessionIds([
      { childSessionIds: ['s1', 's2'] },
      { childSessionIds: ['s3'] },
    ]))).toEqual(['s1', 's2', 's3'])
  })

  it('collects superagent ids from all superagents', () => {
    expect(Array.from(collectSuperagentIds([
      { id: 'sa-1' },
      { id: 'sa-2' },
    ]))).toEqual(['sa-1', 'sa-2'])
  })

  it('collects fleet worktree paths from all superagents', () => {
    expect(Array.from(collectSuperagentFleetWorktreePaths([
      { fleetWorktreePaths: { p1: '/wt-1' } },
      { fleetWorktreePaths: { p2: '/wt-2' } },
    ]))).toEqual(['/wt-1', '/wt-2'])
  })

  it('collects fleet project ids from all superagents and dedupes', () => {
    expect(Array.from(collectSuperagentFleetProjectIds([
      { fleetProjectIds: ['p1', 'p2'] },
      { fleetProjectIds: ['p2', 'p3'] },
    ]))).toEqual(['p1', 'p2', 'p3'])
  })

  it('filters superagent-owned child sessions out of the standard project list', () => {
    expect(filterStandaloneProjectSessions([
      { id: 'standalone-1', worktreePath: '/wt-1' },
      { id: 'child-live', parentSuperagentId: 'sa-1', worktreePath: '/wt-2' },
      { id: 'child-discovered', worktreePath: '/wt-3' },
    ], new Set(['child-discovered']), new Set(['sa-1']))).toEqual([
      { id: 'standalone-1', worktreePath: '/wt-1' },
    ])
  })

  it('keeps orphaned child-tagged sessions in the standard project list', () => {
    expect(filterStandaloneProjectSessions([
      { id: 'orphaned', parentSuperagentId: 'sa-missing', worktreePath: '/wt-1' },
    ], new Set(), new Set(['sa-live']))).toEqual([
      { id: 'orphaned', parentSuperagentId: 'sa-missing', worktreePath: '/wt-1' },
    ])
  })

  it('filters reserved superagent fleet worktrees out of the standard project list', () => {
    expect(filterStandaloneProjectSessions([
      { id: 'standalone-1', worktreePath: '/wt-1' },
      { id: 'fleet-slot', worktreePath: '/wt-fleet' },
    ], new Set(), undefined, new Set(['/wt-fleet']))).toEqual([
      { id: 'standalone-1', worktreePath: '/wt-1' },
    ])
  })
})
