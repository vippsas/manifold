import { useCallback, useMemo } from 'react'
import type {
  FavoriteKind,
  FavoriteRef,
  ManifoldSettings,
  Project,
  ResolvedFavorite,
} from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

export interface UseFavoritesResult {
  /** Resolved, ordered, pruned-for-display favorites. Index 0 maps to ⌘1. */
  favorites: ResolvedFavorite[]
  isFavorite: (kind: FavoriteKind, id: string) => boolean
  toggleFavorite: (kind: FavoriteKind, id: string) => void
  reorderFavorites: (fromIndex: number, toIndex: number) => void
}

export function useFavorites(
  settings: ManifoldSettings,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  projects: Project[],
  workspaces: Workspace[],
): UseFavoritesResult {
  // Stabilizes the empty-array reference when settings.favorites is undefined.
  const raw = useMemo<FavoriteRef[]>(() => settings.favorites ?? [], [settings.favorites])

  const resolveName = useCallback(
    (ref: FavoriteRef): string | null => {
      if (ref.kind === 'repo') return projects.find((p) => p.id === ref.id)?.name ?? null
      return workspaces.find((w) => w.id === ref.id)?.name ?? null
    },
    [projects, workspaces],
  )

  const favorites = useMemo<ResolvedFavorite[]>(() => {
    const out: ResolvedFavorite[] = []
    for (const ref of raw) {
      const name = resolveName(ref)
      if (name !== null) out.push({ kind: ref.kind, id: ref.id, name })
    }
    return out
  }, [raw, resolveName])

  const isFavorite = useCallback(
    (kind: FavoriteKind, id: string): boolean => raw.some((r) => r.kind === kind && r.id === id),
    [raw],
  )

  /**
   * Persist only refs that currently resolve (cleans up stale entries on change).
   * Runs on BOTH toggleFavorite and reorderFavorites, so every mutation prunes
   * unresolved refs from what gets written.
   */
  const persist = useCallback(
    (next: FavoriteRef[]): void => {
      const pruned = next.filter((ref) => resolveName(ref) !== null)
      void updateSettings({ favorites: pruned })
    },
    [resolveName, updateSettings],
  )

  const toggleFavorite = useCallback(
    (kind: FavoriteKind, id: string): void => {
      const exists = raw.some((r) => r.kind === kind && r.id === id)
      const next = exists
        ? raw.filter((r) => !(r.kind === kind && r.id === id))
        : [...raw, { kind, id }]
      persist(next)
    },
    [raw, persist],
  )

  const reorderFavorites = useCallback(
    (fromIndex: number, toIndex: number): void => {
      // Operate on the resolved (visible) order, which the user is dragging.
      const order: FavoriteRef[] = favorites.map((f) => ({ kind: f.kind, id: f.id }))
      if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      // persist() prunes unresolved refs, so we write the pruned visible order.
      persist(order)
    },
    [favorites, persist],
  )

  return { favorites, isFavorite, toggleFavorite, reorderFavorites }
}
