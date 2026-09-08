import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { FilesChevronGlyph } from './SidebarCardActionGlyphs'
import type { RowStatus } from './agent-labels'

export interface RepoGroupHeaderProps {
  name: string
  expanded: boolean
  onToggle: () => void
  summary: { count: number; statuses: RowStatus[] }
}

/** Heads a repo whose home workspace is gone while its worktree workspaces
 *  remain. It is a fold, not a workspace: muted, toggles on click, selects
 *  nothing, offers no menu. */
export function RepoGroupHeader({ name, expanded, onToggle, summary }: RepoGroupHeaderProps): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      className="sidebar-item-row sidebar-repo-group-header"
      style={{ ...sidebarStyles.item, color: 'var(--text-muted)' }}
      title={`${name} — repository with no home workspace`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      }}
    >
      <span className="sidebar-workspace-toggle" aria-hidden="true">
        <span className="sidebar-workspace-toggle__glyph"><WorkspaceGlyph kind="home" /></span>
        <span className="sidebar-workspace-toggle__chevron"><FilesChevronGlyph expanded={expanded} /></span>
      </span>
      <span className="truncate" style={{ minWidth: 0 }}>{name}</span>
      {!expanded && summary.count > 0 && (
        <span className="sidebar-group-summary" aria-hidden="true">
          <span className="sidebar-group-count">{summary.count}</span>
          {summary.statuses.map((s) => <span key={s} className={`status-dot status-dot--${s} status-dot--small`} />)}
        </span>
      )}
    </div>
  )
}
