import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { WorktreesSummary } from '../../shared/dashboard-types'

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
