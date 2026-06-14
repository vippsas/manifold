import { describe, it, expect } from 'vitest'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'
import { activeWorktrees, idleWorktrees, computeStats, groupBranchesByRepo } from './board-model'

const wt = (p: Partial<WorktreeOverviewEntry>): WorktreeOverviewEntry => ({
  worktreePath: p.worktreePath ?? p.branch ?? 'x', projectId: 'p', projectName: 'repo', branch: 'repo/b',
  status: 'idle', sessionId: null, ahead: 0, behind: 0, dirty: false, lastCommitISO: null, locked: false, ...p,
})
const br = (p: Partial<BranchOverviewEntry>): BranchOverviewEntry => ({
  projectId: 'p', projectName: 'repo', branch: 'repo/b', lastCommitISO: null, ...p,
})

const entries = [
  wt({ worktreePath: '1', projectName: 'b-repo', branch: 'b/x', status: 'active' }),
  wt({ worktreePath: '2', projectName: 'a-repo', branch: 'a/y', status: 'active' }),
  wt({ worktreePath: '3', projectName: 'c-repo', branch: 'c/z', status: 'idle', dirty: true }),
  wt({ worktreePath: '4', projectName: 'd-repo', branch: 'd/w', status: 'stale' }),
]

describe('board-model', () => {
  it('activeWorktrees filters to active and sorts by repo then branch', () => {
    expect(activeWorktrees(entries).map((e) => e.projectName)).toEqual(['a-repo', 'b-repo'])
  })

  it('idleWorktrees includes both idle and stale', () => {
    expect(idleWorktrees(entries).map((e) => e.status).sort()).toEqual(['idle', 'stale'])
  })

  it('computeStats counts active, idle (incl. stale), dirty, and prunable', () => {
    expect(computeStats(entries, [br({}), br({ branch: 'repo/b2' })])).toEqual({ active: 2, idle: 2, dirty: 1, prunable: 2 })
  })

  it('groupBranchesByRepo orders repos by count desc and branches newest-first', () => {
    const groups = groupBranchesByRepo([
      br({ projectName: 'one', branch: 'one/a', lastCommitISO: '2026-01-01' }),
      br({ projectName: 'two', branch: 'two/a', lastCommitISO: '2026-01-01' }),
      br({ projectName: 'two', branch: 'two/b', lastCommitISO: '2026-03-01' }),
    ])
    expect(groups.map((g) => g.projectName)).toEqual(['two', 'one'])
    expect(groups[0].branches.map((b) => b.branch)).toEqual(['two/b', 'two/a'])
  })
})
