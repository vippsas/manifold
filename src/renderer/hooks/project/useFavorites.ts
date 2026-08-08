import { useCallback, useMemo } from 'react'
import type { ManifoldSettings, ResolvedFavorite, StoredFavorite } from '../../../shared/types'
import { isWorktreeWorkspace, type Workspace } from '../../../shared/workspace-types'
import { normalizeFavorites } from './normalize-favorites'

export interface UseFavoritesResult {
  /** Resolved, ordered, pruned-for-display favorites. Index 0 maps to ⌘1. */
  favorites: ResolvedFavorite[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
  reorderFavorites: (fromIndex: number, toIndex: number) => void
}

export function useFavorites(
  settings: ManifoldSettings,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  workspaces: Workspace[],
): UseFavoritesResult {
  // Migrated to plain workspace ids on the way in, so nothing below this line
  // has to know the legacy `{kind, id}` shape. The migrated form is not written
  // back on load — the next toggle or reorder persists it (persist() below).
  const raw = useMemo<string[]>(() => {
    const stored: StoredFavorite[] = settings.favorites ?? []
    return normalizeFavorites(stored, workspaces)
  }, [settings.favorites, workspaces])

  const resolve = useCallback(
    (id: string): Workspace | undefined => workspaces.find((w) => w.id === id),
    [workspaces],
  )

  const favorites = useMemo<ResolvedFavorite[]>(() => {
    const out: ResolvedFavorite[] = []
    for (const id of raw) {
      const workspace = resolve(id)
      if (workspace) out.push({ id, name: workspace.name, worktree: isWorktreeWorkspace(workspace) })
    }
    return out
  }, [raw, resolve])

  const isFavorite = useCallback((id: string): boolean => raw.includes(id), [raw])

  /**
   * Persist only ids that currently resolve (cleans up stale entries on change).
   * Runs on BOTH toggleFavorite and reorderFavorites, so every mutation prunes
   * removed workspaces from what gets written.
   */
  const persist = useCallback(
    (next: string[]): void => {
      const pruned = next.filter((id) => resolve(id) !== undefined)
      void updateSettings({ favorites: pruned })
    },
    [resolve, updateSettings],
  )

  const toggleFavorite = useCallback(
    (id: string): void => {
      const next = raw.includes(id) ? raw.filter((r) => r !== id) : [...raw, id]
      persist(next)
    },
    [raw, persist],
  )

  const reorderFavorites = useCallback(
    (fromIndex: number, toIndex: number): void => {
      // Operate on the resolved (visible) order, which the user is dragging.
      const order = favorites.map((f) => f.id)
      if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      // persist() prunes unresolved ids, so we write the pruned visible order.
      persist(order)
    },
    [favorites, persist],
  )

  return { favorites, isFavorite, toggleFavorite, reorderFavorites }
}
