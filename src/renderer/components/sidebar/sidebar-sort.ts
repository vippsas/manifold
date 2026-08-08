import { useCallback, useState } from 'react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { workspaceRowLabel } from './agent-labels'
import { sortByRecency, type ProjectRecency } from './sidebar-recency'

const STORAGE_KEY = 'manifold.sidebar.sort.v1'

/** How the workspace list is ordered. `recency` is the default, so a user who
 *  never touches the toolbar toggle sees the list they always saw. */
export type SidebarSortMode = 'recency' | 'alpha'

function readSortMode(): SidebarSortMode {
  if (typeof localStorage === 'undefined') return 'recency'

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'alpha' || raw === 'recency' ? raw : 'recency'
  } catch {
    return 'recency'
  }
}

export function useSidebarSortMode(): [SidebarSortMode, () => void] {
  const [mode, setMode] = useState<SidebarSortMode>(readSortMode)

  const toggleMode = useCallback((): void => {
    setMode((current) => {
      const next: SidebarSortMode = current === 'alpha' ? 'recency' : 'alpha'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storage can be unavailable in restricted renderer contexts; the toggle
        // still works for this session, there is just nothing to restore next launch.
      }
      return next
    })
  }, [])

  return [mode, toggleMode]
}

/** A→Z as the row reads, left to right: the repo, then the workspace's own name
 *  — so a repo's worktrees stay together and the dimmed prefix earns its place.
 *
 *  The key comes from `workspaceRowLabel`, the same function the row renders
 *  with, so the order can never disagree with what is on screen. A home
 *  workspace has no dimmed prefix (its name *is* its repo), which puts it in its
 *  repo's group by that name.
 *
 *  Nothing is pinned here. Alphabetical exists to make a name's position
 *  predictable, and a row that floats to the top on entry would undo that. */
function sortAlphabetically(workspaces: readonly Workspace[], projects: Project[]): Workspace[] {
  const keyOf = (workspace: Workspace): readonly [string, string] => {
    const label = workspaceRowLabel(workspace, projects)
    return [label.repo ?? label.name, label.name]
  }
  const compare = (left: string, right: string): number =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })

  return [...workspaces].sort((left, right) => {
    const [leftRepo, leftName] = keyOf(left)
    const [rightRepo, rightName] = keyOf(right)
    return compare(leftRepo, rightRepo) || compare(leftName, rightName)
  })
}

export function sortWorkspaces(
  workspaces: readonly Workspace[],
  mode: SidebarSortMode,
  context: { recency: ProjectRecency; activeId: string | null; projects: Project[] },
): Workspace[] {
  return mode === 'alpha'
    ? sortAlphabetically(workspaces, context.projects)
    : sortByRecency(workspaces, context.recency, context.activeId)
}
