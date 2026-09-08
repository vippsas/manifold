import React from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import { workspaceGlyphKind, type Workspace } from '../../../shared/workspace-types'
import { favoritesStyles } from './FavoritesList.styles'
import { sidebarStyles } from './ProjectSidebar.styles'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { WorkspaceRowLabel } from './WorkspaceRowLabel'
import { isLive, rowStatus, workspaceRowLabel, type RowStatus } from './agent-labels'
import type { ProjectRecency } from './sidebar-recency'
import { useSidebarSectionState } from './sidebar-section-state'

export interface WorkingNowRow {
  workspace: Workspace
  status: RowStatus
}

/** Every workspace with a running or waiting agent: waiting first — those need
 *  you — then most recently visited. Computed, never curated. */
export function workingNowRows(
  workspaces: readonly Workspace[],
  sessionsByWorkspace: Record<string, AgentSession[]>,
  recency: ProjectRecency,
): WorkingNowRow[] {
  const rows: WorkingNowRow[] = []
  for (const workspace of workspaces) {
    const sessions = sessionsByWorkspace[workspace.id] ?? []
    if (!isLive(sessions)) continue
    const status = rowStatus(sessions)
    if (status) rows.push({ workspace, status })
  }
  const rank = (r: WorkingNowRow): number => (r.status === 'waiting' ? 0 : 1)
  return rows.sort((a, b) => rank(a) - rank(b) || (recency[b.workspace.id] ?? 0) - (recency[a.workspace.id] ?? 0))
}

export interface WorkingNowListProps {
  workspaces: Workspace[]
  projects: Project[]
  sessionsByWorkspace: Record<string, AgentSession[]>
  recency: ProjectRecency
  onSelectWorkspace: (id: string) => void
}

/** The strip above the tree that says what is alive right now. Flat, so each
 *  row keeps its repo prefix; hidden entirely when nothing is running. */
export function WorkingNowList({ workspaces, projects, sessionsByWorkspace, recency, onSelectWorkspace }: WorkingNowListProps): React.JSX.Element | null {
  const [expanded, toggleExpanded] = useSidebarSectionState('working', true)
  const rows = workingNowRows(workspaces, sessionsByWorkspace, recency)
  if (rows.length === 0) return null

  return (
    <div style={favoritesStyles.section}>
      <SidebarSectionHeader label="Working now" count={rows.length} expanded={expanded} onToggle={toggleExpanded} />
      {expanded && rows.map(({ workspace, status }) => (
        <div
          key={workspace.id}
          role="button"
          tabIndex={0}
          className="sidebar-item-row sidebar-working-row"
          style={sidebarStyles.item}
          title={workspace.name}
          onClick={() => onSelectWorkspace(workspace.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectWorkspace(workspace.id) }
          }}
        >
          <WorkspaceGlyph kind={workspaceGlyphKind(workspace)} />
          <WorkspaceRowLabel label={workspaceRowLabel(workspace, projects)} showRepo status={status} sweeping={false} />
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
    </div>
  )
}
