import type { VerdictRecord, VerdictOutcome } from '../../../shared/verdict-types'

export interface RuntimeStats {
  runtime: string
  total: number
  merged: number
  discarded: number
  mergedPct: number
  discardedPct: number
  avgHumanEditsForMerged: number
}

export interface OutcomeCounts {
  merged: number
  pr_created: number
  committed_only: number
  discarded: number
  unknown: number
}

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
    stats.push({
      runtime,
      total,
      merged: merged.length,
      discarded,
      mergedPct: total === 0 ? 0 : Math.round((merged.length / total) * 100),
      discardedPct: total === 0 ? 0 : Math.round((discarded / total) * 100),
      avgHumanEditsForMerged: merged.length === 0 ? 0 : editsSum / merged.length,
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
