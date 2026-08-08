import type { MenuItem } from '../common/ContextMenu'
import { tidy } from '../common/ContextMenu'

export interface WorkspaceMenuConfig {
  /** Whether this workspace is currently a favorite — flips the first item. */
  isFavorite: boolean
  toggleFavorite: () => void
  /** Starts the row's inline rename. Absent when the card cannot be renamed. */
  rename?: () => void
  copyToWorktree?: () => void
  addFolder?: () => void
  removeWorkspace: () => void
}

/**
 * The right-click menu for a workspace row.
 *
 * Favoriting has no control on the row itself — the row's own hover cluster is
 * `opacity: 0` at rest (theme.css), and a child cannot escape a parent's
 * opacity, so a star there could never stay lit to mark a favorite. This menu is
 * the whole affordance, which is why it also carries the actions the hover
 * cluster offers: a menu that omitted them would read as broken.
 */
export function buildWorkspaceContextMenu(cfg: WorkspaceMenuConfig): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: cfg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      action: cfg.toggleFavorite,
    },
    'separator',
  ]

  if (cfg.rename) items.push({ label: 'Rename…', action: cfg.rename })
  if (cfg.copyToWorktree) items.push({ label: 'Copy to New Worktree', action: cfg.copyToWorktree })
  if (cfg.addFolder) items.push({ label: 'Add Folder…', action: cfg.addFolder })

  items.push('separator', { label: 'Remove Workspace', action: cfg.removeWorkspace })

  return tidy(items)
}
