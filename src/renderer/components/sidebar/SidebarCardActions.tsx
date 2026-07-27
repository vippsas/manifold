import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import { NewAgentGlyph } from './SidebarCardActionGlyphs'

interface SidebarCardActionsProps {
  label: string
  onAddAgent: () => void
}

export function SidebarCardActions({ label, onAddAgent }: SidebarCardActionsProps): React.JSX.Element {
  return (
    <div className="sidebar-card-actions" style={sidebarStyles.cardActions}>
      <button
        type="button"
        onClick={onAddAgent}
        style={sidebarStyles.cardActionButton}
        aria-label={`Add agent to ${label}`}
      >
        <NewAgentGlyph />
        <span>Add agent</span>
      </button>
    </div>
  )
}
