/** Headline numbers for the Worktrees dashboard card. */
export interface WorktreesSummary {
  worktrees: number
  cleanableBranches: number
  repos: number
}

/** Headline numbers for the Statistics dashboard card (aggregated across all repos). */
export interface VerdictsSummary {
  sessions: number
  mergedPct: number
  repos: number
}
