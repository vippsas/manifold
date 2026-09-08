import React from 'react'

/** One muted row standing in for a repo's merged worktrees — `14 merged · show`.
 *  Click reveals them in place for this launch; the default is folded again
 *  next time, since a merged branch is done and only occasionally wanted. */
export function MergedFold({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }): React.JSX.Element {
  const noun = count === 1 ? 'workspace' : 'workspaces'
  return (
    <button
      type="button"
      className="sidebar-merged-fold"
      onClick={onToggle}
      aria-expanded={shown}
      aria-label={`${shown ? 'Hide' : 'Show'} ${count} merged ${noun}`}
    >
      <span className="sidebar-merged-fold__count">{count} merged</span>
      <span aria-hidden="true">· {shown ? 'hide' : 'show'}</span>
    </button>
  )
}
