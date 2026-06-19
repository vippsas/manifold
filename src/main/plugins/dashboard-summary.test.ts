import { describe, it, expect } from 'vitest'
import { summarizeWorktrees } from './dashboard-summary'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'

const wt = (projectId: string, n: number): WorktreeOverviewEntry => ({
  worktreePath: `/wt/${projectId}/${n}`, projectId, projectName: projectId,
  branch: 'b', status: 'idle', sessionId: null, ahead: 0, behind: 0, dirty: false,
  lastCommitISO: null, locked: false,
})
const br = (projectId: string): BranchOverviewEntry => ({ projectId, projectName: projectId, branch: 'x', lastCommitISO: null })

describe('summarizeWorktrees', () => {
  it('counts worktrees, distinct repos, and cleanable branches', () => {
    const s = summarizeWorktrees([wt('a', 1), wt('a', 2), wt('b', 1)], [br('a'), br('b'), br('b')])
    expect(s).toEqual({ worktrees: 3, cleanableBranches: 3, repos: 2 })
  })
  it('is zero-safe', () => {
    expect(summarizeWorktrees([], [])).toEqual({ worktrees: 0, cleanableBranches: 0, repos: 0 })
  })
})
