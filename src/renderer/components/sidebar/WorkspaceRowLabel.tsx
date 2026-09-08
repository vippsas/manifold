import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import type { WorkspaceRowLabel as RowLabel } from './agent-labels'

const WORKING_LABEL = 'An agent is working in this workspace'

export interface WorkspaceRowLabelProps {
  label: RowLabel
  /** False on a nested row: the parent row already names the repo. */
  showRepo: boolean
  /** True while an agent here is emitting output. Drives both signals the row
   *  carries: the dot and the sweep across the name.
   *
   *  Deliberately *not* `AgentStatus`. No status is a usable proxy for
   *  activity — `detectStatus` reports 'waiting' from the mere presence of a
   *  prompt character and falls through to 'running' when nothing matches
   *  (`agent/status-detector.ts:99`), and status is only recomputed when fresh
   *  output arrives — so a status-driven dot sat lit forever on agents doing
   *  nothing. `isOutputting` drops two seconds after the last chunk
   *  (`session-stream-wirer.ts`), which is what makes this signal self-clearing. */
  working: boolean
  onDoubleClick?: (e: React.MouseEvent<HTMLSpanElement>) => void
  title?: string
}

/** The `repo / name  +extra  ●` a workspace row reads as.
 *
 *  Own flex group, so its 6px gap spaces the dot off the name without also
 *  prising the repo, the "/" and the name apart. The sweep class goes on each
 *  segment, never on this wrapper: one `background-clip: text` element paints
 *  everything beneath it from a single gradient, which flattened the repo to
 *  the name's contrast and swallowed the "/". Per segment, each keeps its own
 *  colour as the sweep's base, and `background-attachment: fixed` (theme.css)
 *  is what still makes them read as one band. */
export function WorkspaceRowLabel({ label, showRepo, working, onDoubleClick, title }: WorkspaceRowLabelProps): React.JSX.Element {
  const sweep = working ? 'sidebar-label-working' : ''
  return (
    <span
      className="sidebar-row-label"
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
      onDoubleClick={onDoubleClick}
      title={title}
    >
      <span style={sidebarStyles.rowLabelPath}>
        {showRepo && label.repo && (
          <>
            <span className={sweep} style={sidebarStyles.rowRepo}>{label.repo}</span>
            <span className={sweep} style={sidebarStyles.rowRepoSep}>/</span>
          </>
        )}
        <span className={`truncate ${sweep}`.trim()} style={{ minWidth: 0 }}>{label.name}</span>
        {label.extra && <span className="sidebar-row-extra">{label.extra}</span>}
      </span>
      {working && (
        <span
          className="status-dot status-dot--active"
          role="status"
          aria-label={WORKING_LABEL}
          title={WORKING_LABEL}
        />
      )}
    </span>
  )
}
