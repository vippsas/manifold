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
  copyToWorktree?: () => void
  addFolder?: () => void
  removeWorkspace: () => void
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
  // group's tab bar, and offering it here too made the row's menu read as a
  // second, competing way to do the same thing.
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
  // Not "Copy to New Worktree", which misread twice: from a worktree row it
  // sounded like nesting a worktree inside one, and "copy" promised the current
  // work came along. Neither is true — the new workspace is cut from the repo's
  // clone at its base branch (`workspace-worktrees.ts:61`), and only the set of
  // folders is inherited. The label now says exactly that much.
  if (cfg.copyToWorktree) items.push({ label: 'New Workspace, Same Folders', action: cfg.copyToWorktree })
  if (cfg.addFolder) items.push({ label: 'Add Folder…', action: cfg.addFolder })

  items.push('separator', { label: 'Remove Workspace', action: cfg.removeWorkspace })

  return tidy(items)
}
