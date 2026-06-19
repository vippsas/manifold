import { useEffect, useState } from 'react'
import type { WorktreesSummary } from '../../../shared/dashboard-types'

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

/** Host-owned card list. A future card = one entry appended here. */
export const CARDS: DashboardCardDef[] = [
  { id: 'worktrees', title: 'Worktrees', icon: '⎇', fullViewId: 'manifold.worktrees.panel', useSummary: useWorktreesSummary },
]
