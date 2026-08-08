import type { StoredFavorite } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

/** A workspace that owns no separate checkout — the repos' own clones. It is the
 *  closest thing to "the repository itself", so a legacy repo favorite lands
 *  there in preference to some feature branch's worktree. */
function isHomeWorkspace(workspace: Workspace): boolean {
  return workspace.worktreePaths === undefined
}

/**
 * Fold whatever is on disk into plain workspace ids.
 *
 * Favorites predate workspaces owning the checkout, so a saved favorite may
 * still be a `{kind, id}` ref. A `workspace` ref is just its id. A `repo` ref
 * names a Project, which no longer has a sidebar row of its own — it is
 * remapped to the workspace that spans it, preferring the home workspace, since
 * that is the checkout the repo favorite used to open. A ref whose repo is no
 * longer in any workspace is dropped, exactly as an unresolvable favorite has
 * always been.
 *
 * Order is preserved and duplicates are collapsed — two repo favorites in one
 * workspace would otherwise both map onto it and take two ⌘ slots for one row.
 */
export function normalizeFavorites(
  stored: readonly StoredFavorite[],
  workspaces: readonly Workspace[],
): string[] {
  const out: string[] = []

  const add = (id: string | undefined): void => {
    if (id && !out.includes(id)) out.push(id)
  }

  for (const entry of stored) {
    if (typeof entry === 'string') {
      add(entry)
      continue
    }
    if (entry.kind === 'workspace') {
      add(entry.id)
      continue
    }
    const spanning = workspaces.filter((w) => w.projectIds.includes(entry.id))
    add((spanning.find(isHomeWorkspace) ?? spanning[0])?.id)
  }

  return out
}
