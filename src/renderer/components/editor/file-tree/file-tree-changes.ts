import type { FileChange } from '../../../../shared/types'
import type { TreeChangeEntry } from './tree-node'

/** What a directory's subtree holds — the folder row's roll-up dot. A folder is
 *  never itself "modified"; it only says something inside it is, which is what
 *  makes a change findable while the folder is collapsed. */
export interface DirChangeEntry {
  /** How many changed files are somewhere inside. */
  count: number
  /** True when at least one of them is a direct working-tree change, so the
   *  folder marks itself as vividly as the A/M/D letters inside it. */
  worktreeDirty: boolean
}

export interface TreeChangeMaps {
  /** Changed files, by absolute path. */
  changeMap: Map<string, TreeChangeEntry>
  /** Directories with changes inside them, by absolute path. */
  dirChangeMap: Map<string, DirChangeEntry>
}

/** One root's changes: paths relative to `rootPath`, as the watcher reports them. */
export interface ChangeRoot {
  rootPath: string
  changes: FileChange[]
}

/** Absolute-path change lookups for the tree, one per root.
 *
 *  `changes` from the session watcher is pre-tagged by `mergeFileChanges`;
 *  changes for additional roots come straight from the working-tree watcher, so
 *  they're always direct. */
export function buildChangeMaps(roots: ChangeRoot[]): TreeChangeMaps {
  const changeMap = new Map<string, TreeChangeEntry>()
  const dirChangeMap = new Map<string, DirChangeEntry>()

  for (const { rootPath, changes } of roots) {
    const root = rootPath.replace(/\/$/, '')
    for (const change of changes) {
      const absPath = root ? `${root}/${change.path}` : change.path
      const worktreeDirty = change.worktreeDirty ?? true
      changeMap.set(absPath, { type: change.type, worktreeDirty })
      markAncestors(dirChangeMap, absPath, root, worktreeDirty)
    }
  }

  return { changeMap, dirChangeMap }
}

/** Credit the change to every directory between it and its root. */
function markAncestors(
  dirChangeMap: Map<string, DirChangeEntry>,
  absPath: string,
  root: string,
  worktreeDirty: boolean,
): void {
  let dir = parentDir(absPath)
  while (dir && dir.length >= root.length) {
    const previous = dirChangeMap.get(dir)
    dirChangeMap.set(dir, {
      count: (previous?.count ?? 0) + 1,
      worktreeDirty: (previous?.worktreeDirty ?? false) || worktreeDirty,
    })
    if (dir === root) return
    dir = parentDir(dir)
  }
}

/** The directory holding `path`, or '' at the top. String-only: renderer code
 *  has no `node:path`, and these are always absolute posix paths from main. */
function parentDir(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '' : path.slice(0, slash)
}
