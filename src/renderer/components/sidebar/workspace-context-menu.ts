import type { MenuItem } from '../common/ContextMenu'
import { tidy } from '../common/ContextMenu'

export interface WorkspaceMenuConfig {
  /** Whether this workspace is currently a favorite — flips the first item.
   *  Favoriting reads the dock state, which the sidebar can render without; both
   *  fields are then absent and the item is omitted rather than inert. */
  isFavorite?: boolean
  toggleFavorite?: () => void
  /** Starts the row's inline rename. Absent when the card cannot be renamed. */
  rename?: () => void
  addFolder?: () => void
  removeWorkspace: () => void
  /** Appended in their own section before the destructive item. A solo-repo
   *  card uses this for the path items its (now absent) folder row carried. */
  extraItems?: MenuItem[]
}

/**
 * Every action a workspace row offers, said in words.
 *
 * This list is the row's whole vocabulary, reached two ways: right-click
 * anywhere on the row, or the row's `+` button. The row itself shows no glyph
 * per action on purpose — a fork icon can only mean "worktree" to someone who
 * already knows Manifold models a workspace as one, so the teaching has to
 * happen in language, here.
 *
 * Favoriting has no control on the row either: the hover cluster is
 * `opacity: 0` at rest (theme.css), and a child cannot escape a parent's
 * opacity, so a star there could never stay lit to mark a favorite.
 */
export function buildWorkspaceContextMenu(cfg: WorkspaceMenuConfig): MenuItem[] {
  const items: MenuItem[] = []

  // Deliberately no "New Agent" item: starting an agent belongs to the agent
  // group's tab bar and the sidebar footer, and offering it here too made the
  // row's menu read as a second, competing way to do the same thing. The same
  // sent "New Workspace, Same Folders" away: to the user that action *is* a new,
  // isolated agent, so it now lives in the footer as `+ New Agent`, acting on
  // whichever workspace is selected.
  if (cfg.toggleFavorite) {
    items.push(
      {
        label: cfg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
        action: cfg.toggleFavorite,
      },
      'separator',
    )
  }

  if (cfg.rename) items.push({ label: 'Rename…', action: cfg.rename })
  if (cfg.addFolder) items.push({ label: 'Add Folder to Workspace…', action: cfg.addFolder })

  if (cfg.extraItems?.length) items.push('separator', ...cfg.extraItems)

  items.push('separator', { label: 'Remove Workspace', action: cfg.removeWorkspace })

  return tidy(items)
}
