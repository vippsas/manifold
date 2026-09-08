import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import type { RowStatus, WorkspaceRowLabel as RowLabel } from './agent-labels'

const STATUS_LABEL: Record<RowStatus, string> = {
  running: 'An agent is working in this workspace',
  waiting: 'An agent is waiting for you in this workspace',
  error: 'An agent failed in this workspace',
}

export interface WorkspaceRowLabelProps {
  label: RowLabel
  /** False on a nested row: the parent row already names the repo. */
  showRepo: boolean
  /** Colours the dot; null draws none. */
  status: RowStatus | null
  /** True while an agent here is emitting output — drives the label sweep. */
  sweeping: boolean
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
export function WorkspaceRowLabel({ label, showRepo, status, sweeping, onDoubleClick, title }: WorkspaceRowLabelProps): React.JSX.Element {
  const sweep = sweeping ? 'sidebar-label-working' : ''
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
      {status && (
        <span
          className={`status-dot status-dot--${status}`}
          role="status"
          aria-label={STATUS_LABEL[status]}
          title={STATUS_LABEL[status]}
        />
      )}
    </span>
  )
}
