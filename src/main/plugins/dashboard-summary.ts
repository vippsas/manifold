import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { VerdictRecord } from '../../shared/verdict-types'
import type { WorktreesSummary, VerdictsSummary } from '../../shared/dashboard-types'

/** Pure: fold the worktree overview into the card's three headline numbers. */
export function summarizeWorktrees(
  entries: WorktreeOverviewEntry[],
  cleanable: BranchOverviewEntry[],
): WorktreesSummary {
  return {
    worktrees: entries.length,
    cleanableBranches: cleanable.length,
    repos: new Set(entries.map((e) => e.projectId)).size,
  }
}

/** Pure: fold all captured verdicts into the Statistics card's headline numbers. */
export function summarizeVerdicts(records: VerdictRecord[]): VerdictsSummary {
  const sessions = records.length
  const merged = records.filter((r) => r.outcome === 'merged').length
  return {
    sessions,
    mergedPct: sessions === 0 ? 0 : Math.round((merged / sessions) * 100),
    repos: new Set(records.map((r) => r.projectId)).size,
  }
}
