import { describe, it, expect } from 'vitest'
import { summarizeWorktrees, summarizeVerdicts } from './dashboard-summary'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { VerdictRecord, VerdictOutcome } from '../../shared/verdict-types'

const rec = (projectId: string, outcome: VerdictOutcome): VerdictRecord => ({
  sessionId: `${projectId}-${outcome}-${Math.random()}`, projectId, branch: 'b', runtime: 'claude',
  taskPrompt: { kind: 'full', text: 't' }, outcome, createdAt: '2026-06-19T00:00:00Z',
  metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
})

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

describe('summarizeVerdicts', () => {
  it('counts sessions, distinct repos, and rounds merge rate across all repos', () => {
    const s = summarizeVerdicts([
      rec('a', 'merged'), rec('a', 'discarded'), rec('a', 'merged'),
      rec('b', 'merged'), rec('b', 'pr_created'),
    ])
    // 3 merged of 5 → 60%; repos a,b
    expect(s).toEqual({ sessions: 5, mergedPct: 60, repos: 2 })
  })
  it('is zero-safe', () => {
    expect(summarizeVerdicts([])).toEqual({ sessions: 0, mergedPct: 0, repos: 0 })
  })
})
