import type { VerdictStore } from '../store/verdict-store'
import type { PullRequestState, VerifyPullRequestsResult, VerdictMetrics, VerdictRecord } from '../../shared/verdict-types'
import type { PullRequestStatus } from '../git/pr-status'

export type PullRequestStatusLookup = (prUrl: string) => Promise<PullRequestStatus>

export interface VerdictPrVerifierOptions {
  store: VerdictStore
  lookupStatus: PullRequestStatusLookup
  now?: () => Date
  concurrency?: number
}

const DEFAULT_CONCURRENCY = 4

export async function verifyVerdictPullRequests(opts: VerdictPrVerifierOptions): Promise<VerifyPullRequestsResult> {
  const records = opts.store.listAll()
  const eligible = records.filter((record) => record.outcome === 'pr_created' && Boolean(record.metrics.prUrl))
  const checkedAt = (opts.now ?? (() => new Date()))().toISOString()
  const limit = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY)
  const result: VerifyPullRequestsResult = {
    eligible: eligible.length,
    checked: 0,
    updated: 0,
    failed: 0,
  }

  await mapLimit(eligible, limit, async (record) => {
    const prUrl = record.metrics.prUrl
    if (!prUrl) return
    result.checked++
    try {
      const status = await opts.lookupStatus(prUrl)
      const nextState = resolvePrState(status)
      const nextOutcome = nextState === 'merged' ? 'merged' : record.outcome
      if (nextOutcome !== record.outcome) result.updated++
      opts.store.upsert({
        ...record,
        outcome: nextOutcome,
        metrics: withPrStatus(record.metrics, nextState, checkedAt, status.mergedAt ?? undefined),
      })
    } catch (err) {
      result.failed++
      opts.store.upsert({
        ...record,
        metrics: withPrCheckError(record.metrics, checkedAt, errorMessage(err)),
      })
    }
  })

  return result
}

function resolvePrState(status: PullRequestStatus): PullRequestState {
  if (status.mergedAt) return 'merged'
  return status.state
}

function withPrStatus(
  metrics: VerdictMetrics,
  prState: PullRequestState,
  prCheckedAt: string,
  prMergedAt: string | undefined,
): VerdictMetrics {
  const next: VerdictMetrics = {
    ...metrics,
    prState,
    prCheckedAt,
  }
  if (prMergedAt) next.prMergedAt = prMergedAt
  else delete next.prMergedAt
  delete next.prCheckError
  return next
}

function withPrCheckError(metrics: VerdictMetrics, prCheckedAt: string, prCheckError: string): VerdictMetrics {
  return {
    ...metrics,
    prCheckedAt,
    prCheckError,
  }
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++]
      await worker(item)
    }
  })
  await Promise.all(workers)
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.length > 180 ? `${message.slice(0, 177)}...` : message
}
