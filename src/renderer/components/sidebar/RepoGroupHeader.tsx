import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import { FilesChevronGlyph, RepoGlyph } from './SidebarCardActionGlyphs'
import type { RowStatus } from './agent-labels'

export interface RepoGroupHeaderProps {
  name: string
  expanded: boolean
  onToggle: () => void
  /** Every workspace in the group, the clone included — the header is not one
   *  of them, so it counts them all. */
  summary: { count: number; statuses: RowStatus[] }
}

/** Heads a repo's group of workspaces. It is a **fold, not a workspace**: it
 *  wears the repo glyph rather than a workspace glyph, stays muted, selects
 *  nothing and offers no menu, so the one thing its chevron can mean is "show
 *  this repo's workspaces". The clone hangs underneath it as an ordinary card
 *  alongside the branches — that separation is what makes the tree readable,
 *  since a chevron never has to mean two things at once. */
export function RepoGroupHeader({ name, expanded, onToggle, summary }: RepoGroupHeaderProps): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      className="sidebar-item-row sidebar-repo-group-header"
      style={{ ...sidebarStyles.item, color: 'var(--text-muted)' }}
      title={`${name} — repository`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      }}
    >
      <span className="sidebar-workspace-toggle" aria-hidden="true">
        <span className="sidebar-workspace-toggle__glyph"><RepoGlyph /></span>
        <span className="sidebar-workspace-toggle__chevron"><FilesChevronGlyph expanded={expanded} /></span>
      </span>
      {/* `flex: 1` is load-bearing: `.sidebar-item-row` is
          `justify-content: space-between`, so a label that does not absorb the
          free space gets pushed to the row's right edge, away from its glyph.
          Every workspace row gets this from `.sidebar-row-label`; the header
          has no label component to inherit it from. */}
      <span className="truncate" style={{ minWidth: 0, flex: 1 }}>{name}</span>
      {!expanded && summary.count > 0 && (
        <span className="sidebar-group-summary" aria-hidden="true">
          <span className="sidebar-group-count">{summary.count}</span>
          {summary.statuses.map((s) => <span key={s} className={`status-dot status-dot--${s} status-dot--small`} />)}
        </span>
      )}
    </div>
  )
}
