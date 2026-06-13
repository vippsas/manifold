import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { ShellHeaderActions } from '../../terminal/ShellHeaderActions'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'

/** The standard "toggle side panel" glyph — a panel outline with the edge column
 *  (the sidebar) filled, mirrored to the side being collapsed. */
function SidebarCollapseGlyph({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  const left = side === 'left'
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" />
      <line x1={left ? 6.25 : 9.75} y1="2.75" x2={left ? 6.25 : 9.75} y2="13.25" />
      <rect x={left ? 1.9 : 9.85} y="3" width="4.4" height="10" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  )
}

const SIDEBAR_OWNER: Record<'left' | 'right', string> = { left: 'projects', right: 'fileTree' }
const SIDEBAR_LABEL: Record<'left' | 'right', string> = { left: 'Repositories', right: 'Files' }

/** Collapse button for a dock sidebar, rendered in the group's header-action slot
 *  at the seam with the center pane — only for the group that owns the matching
 *  sidebar panel (left = projects, right = file tree). */
export function SidebarCollapseAction({
  side,
  panels,
}: {
  side: 'left' | 'right'
  panels: IDockviewHeaderActionsProps['panels']
}): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  if (!state || !panels.some((panel) => panel.id === SIDEBAR_OWNER[side])) return null
  const label = `Collapse ${SIDEBAR_LABEL[side]}`
  return (
    <button
      type="button"
      className="dock-header-collapse"
      onClick={() => state.onCollapseSidebar(side)}
      title={label}
      aria-label={label}
    >
      <SidebarCollapseGlyph side={side} />
    </button>
  )
}

/** Left header-action slot: the right file-tree sidebar's collapse button (sitting
 *  at that sidebar's inner edge) plus the existing shell actions. */
export function LeftHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <SidebarCollapseAction side="right" panels={props.panels} />
      <ShellHeaderActions {...props} />
    </div>
  )
}

/** Right header-action slot: the existing workspace actions plus the left
 *  repositories sidebar's collapse button (sitting at that sidebar's inner edge). */
export function RightHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <WorkspaceHeaderActions {...props} />
      <SidebarCollapseAction side="left" panels={props.panels} />
    </div>
  )
}
