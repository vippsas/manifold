import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'

export interface RepoFetchButtonProps {
  repoName: string
  /** The branch `git:fetch` updates — the one the count is measured against. */
  baseBranch: string
  behindCount: number
  isFetching: boolean
  onFetch: () => void
}

/**
 * Pulls a repo's clone up to date from the folder row that names it. Idle it is
 * a quiet ↻; once its base branch falls behind origin it becomes an accent pill
 * carrying the count, so "you are about to cut work from a stale branch" is
 * visible without opening anything.
 */
export function RepoFetchButton({
  repoName,
  baseBranch,
  behindCount,
  isFetching,
  onFetch,
}: RepoFetchButtonProps): React.JSX.Element {
  const behind = isFetching ? 0 : behindCount
  const title = behind > 0
    ? `${baseBranch} is ${behind} commit${behind === 1 ? '' : 's'} behind origin — fetch before starting a new agent`
    : 'Fetch latest from remote'
  const label = behind > 0
    ? `Fetch ${repoName} (${behind} behind origin)`
    : `Fetch ${repoName}`

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onFetch() }}
      onKeyDown={(e) => e.stopPropagation()}
      className="sidebar-icon-button"
      style={behind > 0 ? { ...sidebarStyles.removeButton, ...sidebarStyles.fetchPill } : sidebarStyles.removeButton}
      aria-label={label}
      title={title}
      disabled={isFetching}
    >
      {isFetching ? '...' : '↻'}
      {behind > 0 && <span>{behind > 9 ? '9+' : behind}</span>}
    </button>
  )
}
