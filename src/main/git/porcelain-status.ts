import type { FileChange, FileChangeType } from '../../shared/types'

/** A checkout's uncommitted work split the way git tracks it: what the index
 *  holds and what the working tree holds on top. A file edited, staged, then
 *  edited again appears in both — that is git's own model, not a duplicate. */
export interface WorkspaceStatusGroups {
  staged: FileChange[]
  unstaged: FileChange[]
}

// Git's unmerged porcelain codes — see parseStatusWithConflicts, which applies
// the same rule for the session diff feed.
function isConflictCode(code: string): boolean {
  return code.includes('U') || code === 'AA' || code === 'DD'
}

function typeFor(code: string): FileChangeType {
  if (code === 'A' || code === '?') return 'added'
  if (code === 'D') return 'deleted'
  return 'modified'
}

/** Split `git status --porcelain` into staged and unstaged groups.
 *
 *  Porcelain lines are `XY<space>path`: X is the index column, Y the working
 *  tree column. `parseStatusWithConflicts` ORs the two into a single type,
 *  which is all the file watcher and the session diff feed need; the Source
 *  Control view's staging UI needs them apart, so this reads each column on
 *  its own rather than widening the shared parser.
 *
 *  Conflicts land in unstaged only: a conflicted file's index holds every side
 *  of the merge, so offering it as "staged" would invite committing the
 *  markers. */
export function parseWorkspaceStatus(raw: string): WorkspaceStatusGroups {
  const staged: FileChange[] = []
  const unstaged: FileChange[] = []

  for (const line of raw.split('\n')) {
    if (line.length < 4) continue
    const index = line[0]
    const worktree = line[1]
    const code = line.substring(0, 2)
    const rawPath = line.substring(3)
    // Rename/copy entries render as "old -> new"; both columns describe the
    // destination, so that is the path either group gets (#540).
    const filePath =
      (index === 'R' || index === 'C') && rawPath.includes(' -> ')
        ? rawPath.slice(rawPath.indexOf(' -> ') + 4)
        : rawPath

    if (isConflictCode(code)) {
      unstaged.push({ path: filePath, type: typeFor(index === 'U' ? worktree : index) })
      continue
    }
    if (code === '??') {
      unstaged.push({ path: filePath, type: 'added' })
      continue
    }
    if (index !== ' ') staged.push({ path: filePath, type: typeFor(index) })
    if (worktree !== ' ') unstaged.push({ path: filePath, type: typeFor(worktree) })
  }

  return { staged, unstaged }
}
