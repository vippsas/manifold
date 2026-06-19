import { useEffect, useState } from 'react'
import type { WorktreesSummary, VerdictsSummary } from '../../../shared/dashboard-types'

/** The card's display state: live numbers, loading, or a failed fetch. */
export interface DashboardSummary {
  loading: boolean
  error: boolean
  stats: { label: string; value: string | number }[]
}

/** A host-owned dashboard card: a summary tile that drills into a plugin view. */
export interface DashboardCardDef {
  id: string
  title: string
  /** One-line purpose, shown under the title. */
  description: string
  icon: string
  fullViewId: string
  useSummary: () => DashboardSummary
}

type Stats = DashboardSummary['stats']

// Last-known numbers per channel, kept for the app session. Drilling into a card
// unmounts the grid; on the way back the cards re-mount and would otherwise re-fetch
// from scratch (the worktrees summary runs git across every repo — a few seconds).
// We show the cached numbers instantly and refresh in the background.
const summaryCache = new Map<string, Stats>()

/** Test-only: drop the in-memory summary cache so each case starts cold. */
export function clearDashboardSummaryCache(): void { summaryCache.clear() }

const mapWorktrees = (raw: unknown): Stats => {
  const s = raw as WorktreesSummary
  return [
    { label: 'worktrees', value: s.worktrees },
    { label: 'cleanable', value: s.cleanableBranches },
    { label: 'repos', value: s.repos },
  ]
}

const mapVerdicts = (raw: unknown): Stats => {
  const s = raw as VerdictsSummary
  return [
    { label: 'sessions', value: s.sessions },
    { label: 'merged', value: `${s.mergedPct}%` },
    { label: 'repos', value: s.repos },
  ]
}

/** Stale-while-revalidate: seed from the cache (instant, no loading flash), then
 *  refresh in the background. A failed refresh keeps the cached numbers rather than
 *  flipping to an error — we only show an error when there's nothing cached. */
function useCachedSummary(channel: string, map: (raw: unknown) => Stats): DashboardSummary {
  const cached = summaryCache.get(channel)
  const [state, setState] = useState<DashboardSummary>(
    cached ? { loading: false, error: false, stats: cached } : { loading: true, error: false, stats: [] },
  )
  useEffect(() => {
    let live = true
    window.electronAPI.invoke(channel)
      .then((raw) => {
        if (!live) return
        const stats = map(raw)
        summaryCache.set(channel, stats)
        setState({ loading: false, error: false, stats })
      })
      .catch(() => {
        if (!live) return
        const fallback = summaryCache.get(channel)
        setState(fallback ? { loading: false, error: false, stats: fallback } : { loading: false, error: true, stats: [] })
      })
    return () => { live = false }
  }, [channel, map])
  return state
}

export function useWorktreesSummary(): DashboardSummary {
  return useCachedSummary('dashboard:worktrees-summary', mapWorktrees)
}

export function useVerdictsSummary(): DashboardSummary {
  return useCachedSummary('dashboard:verdicts-summary', mapVerdicts)
}

/** Host-owned card list. A future card = one entry appended here. */
export const CARDS: DashboardCardDef[] = [
  {
    id: 'worktrees', title: 'Worktrees', icon: '⎇',
    description: 'Review and clean up worktrees and merged branches across every repo.',
    fullViewId: 'manifold.worktrees.panel', useSummary: useWorktreesSummary,
  },
  {
    id: 'statistics', title: 'Statistics', icon: '◔',
    description: 'Per-runtime quality metrics and recent sessions across every repo.',
    fullViewId: 'manifold.statistics.panel', useSummary: useVerdictsSummary,
  },
]
