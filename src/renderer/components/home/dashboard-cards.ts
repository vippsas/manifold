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
  icon: string
  fullViewId: string
  useSummary: () => DashboardSummary
}

export function useWorktreesSummary(): DashboardSummary {
  const [state, setState] = useState<DashboardSummary>({ loading: true, error: false, stats: [] })
  useEffect(() => {
    let live = true
    window.electronAPI.invoke('dashboard:worktrees-summary')
      .then((raw) => {
        if (!live) return
        const s = raw as WorktreesSummary
        setState({
          loading: false, error: false, stats: [
            { label: 'worktrees', value: s.worktrees },
            { label: 'cleanable', value: s.cleanableBranches },
            { label: 'repos', value: s.repos },
          ],
        })
      })
      .catch(() => { if (live) setState({ loading: false, error: true, stats: [] }) })
    return () => { live = false }
  }, [])
  return state
}

export function useVerdictsSummary(): DashboardSummary {
  const [state, setState] = useState<DashboardSummary>({ loading: true, error: false, stats: [] })
  useEffect(() => {
    let live = true
    window.electronAPI.invoke('dashboard:verdicts-summary')
      .then((raw) => {
        if (!live) return
        const s = raw as VerdictsSummary
        setState({
          loading: false, error: false, stats: [
            { label: 'sessions', value: s.sessions },
            { label: 'merged', value: `${s.mergedPct}%` },
            { label: 'repos', value: s.repos },
          ],
        })
      })
      .catch(() => { if (live) setState({ loading: false, error: true, stats: [] }) })
    return () => { live = false }
  }, [])
  return state
}

/** Host-owned card list. A future card = one entry appended here. */
export const CARDS: DashboardCardDef[] = [
  { id: 'worktrees', title: 'Worktrees', icon: '⎇', fullViewId: 'manifold.worktrees.panel', useSummary: useWorktreesSummary },
  { id: 'statistics', title: 'Statistics', icon: '◔', fullViewId: 'manifold.statistics.panel', useSummary: useVerdictsSummary },
]
