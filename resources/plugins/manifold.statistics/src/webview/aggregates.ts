import type { VerdictRecord, VerdictOutcome, ProjectVerdicts } from 'manifold'

export interface ProjectStat {
  projectId: string
  projectName: string
  total: number
  merged: number
  mergedPct: number
}

/** Per-repo session counts + merge rate, sorted alphabetically by repo name. */
export function computeProjectStats(groups: ProjectVerdicts[]): ProjectStat[] {
  return groups
    .map((g) => {
      const total = g.records.length
      const merged = g.records.filter((r: VerdictRecord) => r.outcome === 'merged').length
      return {
        projectId: g.projectId,
        projectName: g.projectName,
        total,
        merged,
        mergedPct: total === 0 ? 0 : Math.round((merged / total) * 100),
      }
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
}

export interface RuntimeStats {
  runtime: string
  total: number
  merged: number
  discarded: number
  mergedPct: number
  discardedPct: number
  avgHumanEditsForMerged: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  turns: number
}

export type OutcomeCounts = Record<VerdictOutcome, number>

export function computeRuntimeStats(records: VerdictRecord[]): RuntimeStats[] {
  const byRuntime = new Map<string, VerdictRecord[]>()
  for (const record of records) {
    const bucket = byRuntime.get(record.runtime) ?? []
    bucket.push(record)
    byRuntime.set(record.runtime, bucket)
  }

  const stats: RuntimeStats[] = []
  for (const [runtime, bucket] of byRuntime) {
    const total = bucket.length
    const merged = bucket.filter((r) => r.outcome === 'merged')
    const discarded = bucket.filter((r) => r.outcome === 'discarded').length
    const editsSum = merged.reduce((sum, r) => sum + r.metrics.humanEdits, 0)
    const tokenSum = bucket.reduce((acc, r) => {
      const u = r.metrics.tokenUsage
      acc.inputTokens += u?.inputTokens ?? 0
      acc.outputTokens += u?.outputTokens ?? 0
      acc.cacheReadTokens += u?.cacheReadTokens ?? 0
      acc.cacheCreationTokens += u?.cacheCreationTokens ?? 0
      acc.turns += r.metrics.turns ?? 0
      return acc
    }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0 })
    stats.push({
      runtime,
      total,
      merged: merged.length,
      discarded,
      mergedPct: total === 0 ? 0 : Math.round((merged.length / total) * 100),
      discardedPct: total === 0 ? 0 : Math.round((discarded / total) * 100),
      avgHumanEditsForMerged: merged.length === 0 ? 0 : editsSum / merged.length,
      ...tokenSum,
    })
  }

  return stats.sort((left, right) => left.runtime.localeCompare(right.runtime))
}

export function computeOutcomeCounts(records: VerdictRecord[]): OutcomeCounts {
  const counts: OutcomeCounts = { merged: 0, pr_created: 0, committed_only: 0, discarded: 0, unknown: 0 }
  for (const record of records) {
    const key: VerdictOutcome = record.outcome
    counts[key]++
  }
  return counts
}

export function sortRecentFirst(records: VerdictRecord[]): VerdictRecord[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

/**
 * Count sessions that produced a pull request — i.e. carry a PR url — regardless
 * of outcome. The outcome footer buckets are a terminal funnel (a merged PR lands
 * in `merged`, not `pr_created`), so a PRs-created tally needs this separate pass.
 */
export function countSessionsWithPr(records: VerdictRecord[]): number {
  return records.filter((r) => Boolean(r.metrics.prUrl)).length
}
